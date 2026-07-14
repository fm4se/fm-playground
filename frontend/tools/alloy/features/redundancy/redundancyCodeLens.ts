import * as vscode from 'vscode';
import { jotaiStore, editorValueAtom, lineToHighlightAtom, permalinkAtom, minimalSetRangesAtom, targetAssertionRangeAtom, cursorLineAtom, cursorColumnAtom, selectionRangeAtom } from '@/atoms';
import { alloyRedundancyResultsAtom, alloyExplainResultsAtom, AlloyRedundantConstraint } from './redundancyAtoms';
import { logToDb } from '@/api/playgroundApi';
import { executeAlloyExplainRedundancy } from '../../alloyExecutor';

let codeLensProviderDisposableAls: any = null;
let codeLensProviderDisposableAlloy: any = null;
let codeLensEmitter: any = null;

let vscodeEmitterRef: any = null;
let vscodeDisposableAls: any = null;
let vscodeDisposableAlloy: any = null;

let monacoCommandsRegistered = false;
let vscodeCommandsRegistered = false;

function isVscodeApiReady(): boolean {
    try {
        return Boolean(vscode && vscode.commands && typeof vscode.commands.registerCommand === 'function');
    } catch {
        return false;
    }
}


export let isCodeLensEdit = false;

export function triggerAlloyCodeLensUpdate() {
    if (codeLensEmitter) {
        codeLensEmitter.fire();
    }
    if (vscodeEmitterRef) {
        vscodeEmitterRef.fire();
    }
}

function handleCommentOutConstraint(constraint: AlloyRedundantConstraint) {
    const editorValue = (jotaiStore.get(editorValueAtom) as string) || '';
    const lines = editorValue.split(/\r?\n/);
    const max = lines.length;

    if (!constraint?.position?.startLine || !constraint?.position?.endLine) return;

    const s = Math.max(1, Math.min(constraint.position.startLine, max));
    const e = Math.max(1, Math.min(constraint.position.endLine, max));

    for (let i = Math.min(s, e); i <= Math.max(s, e); i++) {
        const idx = i - 1;
        if (idx >= 0 && idx < lines.length) {
            const original = lines[idx];
            if (/^\s*(\/\/|--)/.test(original)) continue;
            const m = original.match(/^(\s*)(.*)$/);
            const indent = m ? m[1] : '';
            const rest = m ? m[2] : original;
            lines[idx] = `${indent}// ${rest}`;
        }
    }

    const updatedCode = lines.join('\n');
    isCodeLensEdit = true;
    jotaiStore.set(editorValueAtom, updatedCode);
    setTimeout(() => { isCodeLensEdit = false; }, 100);

    const currentResults = jotaiStore.get(alloyRedundancyResultsAtom);
    if (currentResults && currentResults.redundantConstraints) {
        const remaining = currentResults.redundantConstraints.filter(
            (c) => c.constraintIndex !== constraint.constraintIndex
        );
        jotaiStore.set(alloyRedundancyResultsAtom, {
            ...currentResults,
            redundantCount: remaining.length,
            redundantConstraints: remaining,
        });

        const lineSet = new Set<number>();
        remaining.forEach((c) => {
            if (c?.position?.startLine && c?.position?.endLine) {
                for (let l = c.position.startLine; l <= c.position.endLine; l++) {
                    lineSet.add(l);
                }
            }
        });
        jotaiStore.set(lineToHighlightAtom, Array.from(lineSet));
    }

    const currentExplain = jotaiStore.get(alloyExplainResultsAtom);
    if (currentExplain) {
        jotaiStore.set(alloyExplainResultsAtom, null);
        jotaiStore.set(minimalSetRangesAtom, []);
        jotaiStore.set(targetAssertionRangeAtom, null);
    }

    triggerAlloyCodeLensUpdate();

    const permalink = jotaiStore.get(permalinkAtom);
    if (permalink?.permalink) {
        logToDb(permalink.permalink, {
            action: 'comment-alloy-redundant-single',
            constraintIndex: constraint.constraintIndex,
        });
    }
}

function handleRemoveConstraint(constraint: AlloyRedundantConstraint) {
    const editorValue = (jotaiStore.get(editorValueAtom) as string) || '';
    const lines = editorValue.split(/\r?\n/);
    const max = lines.length;

    if (!constraint?.position?.startLine || !constraint?.position?.endLine) return;

    const s = Math.max(1, Math.min(constraint.position.startLine, max));
    const e = Math.max(1, Math.min(constraint.position.endLine, max));
    const linesToRemoveCount = Math.max(s, e) - Math.min(s, e) + 1;

    lines.splice(Math.min(s, e) - 1, linesToRemoveCount);

    const updatedCode = lines.join('\n');
    isCodeLensEdit = true;
    jotaiStore.set(editorValueAtom, updatedCode);
    setTimeout(() => { isCodeLensEdit = false; }, 100);

    const currentResults = jotaiStore.get(alloyRedundancyResultsAtom);
    if (currentResults && currentResults.redundantConstraints) {
        const remaining = currentResults.redundantConstraints
            .filter((c) => c.constraintIndex !== constraint.constraintIndex)
            .map((c) => {
                if (c.position.startLine > e) {
                    return {
                        ...c,
                        position: {
                            ...c.position,
                            startLine: c.position.startLine - linesToRemoveCount,
                            endLine: c.position.endLine - linesToRemoveCount,
                        },
                    };
                }
                return c;
            });

        jotaiStore.set(alloyRedundancyResultsAtom, {
            ...currentResults,
            redundantCount: remaining.length,
            redundantConstraints: remaining,
        });

        const lineSet = new Set<number>();
        remaining.forEach((c) => {
            if (c?.position?.startLine && c?.position?.endLine) {
                for (let l = c.position.startLine; l <= c.position.endLine; l++) {
                    lineSet.add(l);
                }
            }
        });
        jotaiStore.set(lineToHighlightAtom, Array.from(lineSet));
    }

    const currentExplain = jotaiStore.get(alloyExplainResultsAtom);
    if (currentExplain) {
        jotaiStore.set(alloyExplainResultsAtom, null);
        jotaiStore.set(minimalSetRangesAtom, []);
        jotaiStore.set(targetAssertionRangeAtom, null);
    }

    triggerAlloyCodeLensUpdate();

    const permalink = jotaiStore.get(permalinkAtom);
    if (permalink?.permalink) {
        logToDb(permalink.permalink, {
            action: 'remove-alloy-redundant-single',
            constraintIndex: constraint.constraintIndex,
        });
    }
}

function handleExplainConstraint(constraint: AlloyRedundantConstraint) {
    if (!constraint?.position?.startLine || !constraint?.position?.startCol) return;

    jotaiStore.set(cursorLineAtom, constraint.position.startLine);
    jotaiStore.set(cursorColumnAtom, constraint.position.startCol);
    jotaiStore.set(selectionRangeAtom, null);

    executeAlloyExplainRedundancy();
}

function getActiveLensesConstraints(): AlloyRedundantConstraint[] {
    const checkResults = jotaiStore.get(alloyRedundancyResultsAtom);
    const explainResults = jotaiStore.get(alloyExplainResultsAtom);
    const constraints: AlloyRedundantConstraint[] = [];

    if (checkResults?.redundantConstraints) {
        constraints.push(...checkResults.redundantConstraints);
    }

    if (explainResults?.redundant && explainResults?.selectedConstraint?.position?.startLine) {
        constraints.push({
            constraintIndex: -999, // special identifier for explain target
            expression: explainResults.selectedConstraint.expression,
            sourceText: explainResults.selectedConstraint.sourceText,
            position: explainResults.selectedConstraint.position,
        });
    }

    return constraints;
}

export function setupAlloyRedundancyCodeLens(monacoModule: any) {
    if (!monacoCommandsRegistered && monacoModule?.editor?.registerCommand) {
        monacoModule.editor.registerCommand('alloy.redundancy.commentOut', (_accessor: any, constraint: AlloyRedundantConstraint) => {
            handleCommentOutConstraint(constraint);
        });
        monacoModule.editor.registerCommand('alloy.redundancy.remove', (_accessor: any, constraint: AlloyRedundantConstraint) => {
            handleRemoveConstraint(constraint);
        });
        monacoModule.editor.registerCommand('alloy.redundancy.explain', (_accessor: any, constraint: AlloyRedundantConstraint) => {
            handleExplainConstraint(constraint);
        });
        monacoCommandsRegistered = true;
    }

    // Register in VSCode Command Service (used globally when @codingame/monaco-vscode-api override is active)
    if (!vscodeCommandsRegistered && isVscodeApiReady()) {
        try {
            if (vscode?.commands?.registerCommand) {
                vscode.commands.registerCommand('alloy.redundancy.commentOut', (constraint: AlloyRedundantConstraint) => {
                    handleCommentOutConstraint(constraint);
                });
                vscode.commands.registerCommand('alloy.redundancy.remove', (constraint: AlloyRedundantConstraint) => {
                    handleRemoveConstraint(constraint);
                });
                vscode.commands.registerCommand('alloy.redundancy.explain', (constraint: AlloyRedundantConstraint) => {
                    handleExplainConstraint(constraint);
                });
                vscodeCommandsRegistered = true;
            }
        } catch (err) {
            // Ignore if commands already registered
        }
    }

    // --- Native Monaco CodeLens Provider ---
    if (monacoModule?.languages?.registerCodeLensProvider) {
        if (!codeLensEmitter) {
            codeLensEmitter = new monacoModule.Emitter();
        }

        const monacoProvider = {
            onDidChange: codeLensEmitter!.event,
            provideCodeLenses: (_model: any, _token: any) => {
                const constraints = getActiveLensesConstraints();
                if (constraints.length === 0) {
                    return { lenses: [], dispose: () => { } };
                }

                const lenses: any[] = [];
                for (const c of constraints) {
                    if (c?.position?.startLine) {
                        const range = {
                            startLineNumber: c.position.startLine,
                            startColumn: 1,
                            endLineNumber: c.position.startLine,
                            endColumn: 1,
                        };
                        if (c.constraintIndex !== -999) {
                            lenses.push({
                                range,
                                id: `comment-${c.constraintIndex}`,
                                command: {
                                    id: 'alloy.redundancy.commentOut',
                                    title: 'Comment out',
                                    arguments: [c],
                                },
                            });
                            lenses.push({
                                range,
                                id: `remove-${c.constraintIndex}`,
                                command: {
                                    id: 'alloy.redundancy.remove',
                                    title: 'Remove',
                                    arguments: [c],
                                },
                            });
                            lenses.push({
                                range,
                                id: `explain-${c.constraintIndex}`,
                                command: {
                                    id: 'alloy.redundancy.explain',
                                    title: 'Explain Redundancy',
                                    arguments: [c],
                                },
                            });
                        }
                    }
                }

                return { lenses, dispose: () => { } };
            },
            resolveCodeLens: (_model: any, codeLens: any, _token: any) => codeLens,
        };

        if (codeLensProviderDisposableAls) codeLensProviderDisposableAls.dispose();
        if (codeLensProviderDisposableAlloy) codeLensProviderDisposableAlloy.dispose();

        codeLensProviderDisposableAls = monacoModule.languages.registerCodeLensProvider('als', monacoProvider);
        codeLensProviderDisposableAlloy = monacoModule.languages.registerCodeLensProvider('alloy', monacoProvider);
    }

    // --- VSCode CodeLens Provider (LSP & Monaco-VSCode API Wrapper Mode) ---
    if (isVscodeApiReady() && vscode?.languages?.registerCodeLensProvider) {
        if (!vscodeEmitterRef) {
            vscodeEmitterRef = new vscode.EventEmitter<void>();
        }

        const vscodeProvider = {
            onDidChangeCodeLenses: vscodeEmitterRef.event,
            provideCodeLenses: (_doc: any, _token: any) => {
                const constraints = getActiveLensesConstraints();
                if (constraints.length === 0) {
                    return [];
                }

                const lenses: any[] = [];
                for (const c of constraints) {
                    if (c?.position?.startLine) {
                        // VSCode Range is 0-indexed
                        const lineIdx = Math.max(0, c.position.startLine - 1);
                        const range = new vscode.Range(lineIdx, 0, lineIdx, 0);
                        if (c.constraintIndex !== -999) {
                            lenses.push(new vscode.CodeLens(range, {
                                command: 'alloy.redundancy.commentOut',
                                title: 'Comment out',
                                arguments: [c],
                            }));
                            lenses.push(new vscode.CodeLens(range, {
                                command: 'alloy.redundancy.remove',
                                title: 'Remove',
                                arguments: [c],
                            }));
                            lenses.push(new vscode.CodeLens(range, {
                                command: 'alloy.redundancy.explain',
                                title: 'Explain Redundancy',
                                arguments: [c],
                            }));
                        }
                    }
                }

                return lenses;
            },
            resolveCodeLens: (_codeLens: any, _token: any) => _codeLens,
        };

        if (vscodeDisposableAls) vscodeDisposableAls.dispose();
        if (vscodeDisposableAlloy) vscodeDisposableAlloy.dispose();

        try {
            vscodeDisposableAls = vscode.languages.registerCodeLensProvider({ language: 'als' }, vscodeProvider);
            vscodeDisposableAlloy = vscode.languages.registerCodeLensProvider({ language: 'alloy' }, vscodeProvider);
        } catch (e) {
            // Ignore if provider registration fails
        }
    }
}
