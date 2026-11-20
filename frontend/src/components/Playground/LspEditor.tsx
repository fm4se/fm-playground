import React, { useEffect, useRef, useState } from 'react';
import { LanguageClientWrapper } from 'monaco-languageclient/lcwrapper';
import type { LanguageClientConfig } from 'monaco-languageclient/lcwrapper';
import { EditorApp } from 'monaco-languageclient/editorApp';
import { createDynamicLspConfig } from '@/../tools/common/dynamicLspWrapperConfig';
import type { LspConfig } from '@/../tools/common/lspTypes';
import { reportLspFailure } from '@/monitoring';
import { ensureVscodeApi, LSP_START_TIMEOUT_MS, setEditorDarkTheme, terminateLanguageServerWorker, withTimeout } from './lspRuntime';
import '../../assets/style/Playground.css';
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import type { LanguageProps } from './Tools';
import * as monaco from 'monaco-editor';
import { useAtom } from 'jotai';
import {
    editorValueAtom,
    cursorLineAtom,
    cursorColumnAtom,
    greenHighlightAtom,
    selectedTextAtom,
    selectionRangeAtom,
    targetAssertionRangeAtom,
    minimalSetRangesAtom,
    jotaiStore,
} from '@/atoms';
import Editor from './Editor'; // Fallback editor
import { alloyRedundancyResultsAtom, alloyExplainResultsAtom, triggerAlloyCodeLensUpdate, isAlloyCodeLensEdit } from '@/../tools/alloy/features';
import { isSmtCodeLensEdit, clearSmtRedundancyLenses } from '@/../tools/smt/features';

type LspEditorProps = {
    height: string;
    setEditorValue: (value: string) => void;
    editorValue: string;
    language: LanguageProps;
    setLanguage?: (value: string) => void;
    lineToHighlight: number[];
    setLineToHighlight: (line: number[]) => void;
    editorTheme?: string;
    /**
     * Language server features (syntax checking, completion, ...). When false, the same
     * editor runs without a language client: same highlighting and theme, no diagnostics.
     * Default: true.
     */
    languageFeatures?: boolean;
    /** Optional callback fired when the editor instance is ready */
    onEditorReady?: (editor: any, monacoModule: any) => void;
    onRunShortcut?: () => void;
};

// Global instances for v10 API (the VS Code API itself is started in lspRuntime.ts)
let lcWrapperInstance: LanguageClientWrapper | null = null;
let editorAppInstance: EditorApp | null = null;

const LspEditor: React.FC<LspEditorProps> = (props) => {
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const prevLanguageRef = useRef<LanguageProps | null>(null);
    const isInitializedRef = useRef<boolean>(false);
    const [lspFailed, setLspFailed] = useState<boolean>(false); // Track LSP initialization failure
    const cursorListenerRef = useRef<any>(null); // Store cursor listener disposable
    const [decorationIds, setDecorationIds] = useState<string[]>([]);
    const [greenDecorationIds, setGreenDecorationIds] = useState<string[]>([]);
    const [rangeDecorationIds, setRangeDecorationIds] = useState<string[]>([]);
    const [greenHighlight, setGreenHighlight] = useAtom(greenHighlightAtom);
    const [, setCursorLine] = useAtom(cursorLineAtom);
    const [, setCursorColumn] = useAtom(cursorColumnAtom);
    const [, setSelectedText] = useAtom(selectedTextAtom);
    const [, setSelectionRange] = useAtom(selectionRangeAtom);
    const [targetAssertionRange] = useAtom(targetAssertionRangeAtom);
    const [minimalSetRanges] = useAtom(minimalSetRangesAtom);
    const onRunShortcutRef = useRef(props.onRunShortcut);
    const shortcutDisposablesRef = useRef<any[]>([]);
    const languageFeaturesRef = useRef(props.languageFeatures ?? true);
    /** Incremented on every editor (re)start; stale async work compares against it. */
    const sessionRef = useRef(0);
    /** Language client config from the editor's start-up config, until a client uses it. */
    const pendingClientConfigRef = useRef<LanguageClientConfig | null>(null);
    /** Serialises language client starts/stops so quick toggles can't overlap. */
    const clientQueueRef = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        onRunShortcutRef.current = props.onRunShortcut;
    }, [props.onRunShortcut]);

    // Editor colour theme follows the app's dark mode (one global VS Code theme).
    useEffect(() => {
        setEditorDarkTheme(props.editorTheme === 'vs-dark');
    }, [props.editorTheme]);

    const startLanguageClient = async (session: number) => {
        let clientConfig = pendingClientConfigRef.current;
        pendingClientConfigRef.current = null;
        if (!clientConfig) {
            // Switched back on: needs a fresh language server. Continue the telemetry
            // episode instead of starting a new one (toggling never reset it before).
            const config = await createDynamicLspConfig(props.language.short, { startNewTelemetryEpisode: false });
            if (!config) return; // already reported; the editor keeps working without it
            if (config.languageServerError) {
                reportLspFailure(config.languageServerError, props.language.short);
                terminateLanguageServerWorker(config.languageClientConfig);
                return;
            }
            clientConfig = config.languageClientConfig;
            try {
                await ensureVscodeApi(config.vscodeApiConfig);
            } catch (error) {
                terminateLanguageServerWorker(clientConfig);
                throw error;
            }
        }
        if (session !== sessionRef.current || !languageFeaturesRef.current) {
            terminateLanguageServerWorker(clientConfig);
            return;
        }
        const client = new LanguageClientWrapper(clientConfig);
        try {
            await withTimeout(client.start(), LSP_START_TIMEOUT_MS, 'Starting the language client');
        } catch (error) {
            // Only the language features are lost; the editor itself keeps working.
            console.error('Language server failed to start; the editor continues without syntax checking:', error);
            reportLspFailure(error, props.language.short);
            client.dispose(true).catch(() => {});
            return;
        }
        if (session !== sessionRef.current || !languageFeaturesRef.current) {
            client.dispose(true).catch(console.error);
            return;
        }
        lcWrapperInstance = client;
    };

    /** Starts or stops the language client to match the syntax-checking setting. */
    const syncLanguageClient = () => {
        const session = sessionRef.current;
        clientQueueRef.current = clientQueueRef.current
            .then(async () => {
                if (session !== sessionRef.current || !isInitializedRef.current) return;
                if (languageFeaturesRef.current) {
                    if (!lcWrapperInstance) await startLanguageClient(session);
                } else {
                    if (pendingClientConfigRef.current) {
                        terminateLanguageServerWorker(pendingClientConfigRef.current);
                        pendingClientConfigRef.current = null;
                    }
                    const client = lcWrapperInstance;
                    lcWrapperInstance = null;
                    // Disposing also removes the client's diagnostics from the editor.
                    await client?.dispose(true);
                }
            })
            .catch((error) => console.error('Error switching syntax checking:', error));
    };

    useEffect(() => {
        languageFeaturesRef.current = props.languageFeatures ?? true;
        if (isInitializedRef.current) syncLanguageClient();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.languageFeatures]);

    useEffect(() => {
        return () => {
            shortcutDisposablesRef.current.forEach((d) => {
                if (d && typeof d.dispose === 'function') d.dispose();
            });
        };
    }, []);

    const handleCodeChange = (value: string) => {
        props.setEditorValue(value);
        if (!isAlloyCodeLensEdit && !isSmtCodeLensEdit) {
            props.setLineToHighlight([]);
            setGreenHighlight([]);
            // Clear range-based highlights
            jotaiStore.set(targetAssertionRangeAtom, null);
            jotaiStore.set(minimalSetRangesAtom, []);
            jotaiStore.set(alloyRedundancyResultsAtom, null);
            jotaiStore.set(alloyExplainResultsAtom, null);
            triggerAlloyCodeLensUpdate();
            clearSmtRedundancyLenses();
        }
    };

    useEffect(() => {
        // Don't initialize if language is not set yet
        if (!props.language?.id) {
            return;
        }

        // Cancellation flag: set to true when cleanup runs so stale async
        // initializations bail out instead of completing on a stale language.
        let cancelled = false;

        const startEditor = async () => {
            // Abort if container not available
            if (!containerRef.current) {
                return;
            }
            const session = sessionRef.current;

            // Dispose existing instances (true: also terminate the language server worker)
            if (lcWrapperInstance) {
                await lcWrapperInstance.dispose(true);
                lcWrapperInstance = null;
            }
            if (cancelled) return;

            if (editorAppInstance?.isStarted()) {
                await editorAppInstance.dispose();
                editorAppInstance = null;
            }
            if (cancelled) return;

            isInitializedRef.current = false;

            let lspConfig: LspConfig | null = null;
            try {
                lspConfig = await createDynamicLspConfig(props.language.short);

                if (cancelled) {
                    if (lspConfig) terminateLanguageServerWorker(lspConfig.languageClientConfig);
                    return;
                }

                if (!lspConfig) {
                    console.warn(`LSP not available for ${props.language.short}, falling back to basic editor`);
                    setLspFailed(true);
                    return;
                }

                // Reset lspFailed so the container div becomes visible
                // before Monaco tries to render into it.
                setLspFailed(false);

                // Start the VS Code API (once per page) or register this tool's extension
                await ensureVscodeApi(lspConfig.vscodeApiConfig);
                if (cancelled) {
                    terminateLanguageServerWorker(lspConfig.languageClientConfig);
                    return;
                }

                // Create and start the editor first: if only the language server fails later,
                // the editor stays (without syntax checking) instead of falling back.
                editorAppInstance = new EditorApp(lspConfig.editorAppConfig);
                await editorAppInstance.start(containerRef.current);

                // If cancelled after start, tear down immediately and bail out
                if (cancelled) {
                    editorAppInstance.dispose().catch(console.error);
                    editorAppInstance = null;
                    terminateLanguageServerWorker(lspConfig.languageClientConfig);
                    return;
                }

                editorRef.current = editorAppInstance.getEditor();
                setLspFailed(false);

                shortcutDisposablesRef.current.forEach((d) => {
                    if (d && typeof d.dispose === 'function') d.dispose();
                });
                shortcutDisposablesRef.current = [];

                const cmdDisposable = editorRef.current!.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    onRunShortcutRef.current?.();
                });
                const keyDisposable = editorRef.current!.onKeyDown((e: any) => {
                    if ((e.ctrlKey || e.metaKey) && (e.keyCode === monaco.KeyCode.KeyS || e.browserEvent?.key === 's' || e.browserEvent?.key === 'S')) {
                        e.preventDefault();
                        e.stopPropagation();
                        onRunShortcutRef.current?.();
                    }
                });
                if (cmdDisposable) shortcutDisposablesRef.current.push(cmdDisposable);
                if (keyDisposable) shortcutDisposablesRef.current.push(keyDisposable);

                // Dispose old cursor listener if exists
                if (cursorListenerRef.current) {
                    cursorListenerRef.current.dispose();
                }

                // Track cursor position changes
                cursorListenerRef.current = editorRef.current!.onDidChangeCursorPosition((e: any) => {
                    const lineNumber = e.position.lineNumber;
                    const column = e.position.column;
                    setCursorLine(lineNumber);
                    setCursorColumn(column);
                });

                // Track selection changes
                editorRef.current!.onDidChangeCursorSelection((e: any) => {
                    const model = editorRef.current!.getModel();
                    if (model) {
                        const selection = e.selection;
                        const selectedText = model.getValueInRange(selection);
                        setSelectedText(selectedText);

                        // Store the selection range
                        setSelectionRange({
                            startLine: selection.startLineNumber,
                            startColumn: selection.startColumn,
                            endLine: selection.endLineNumber,
                            endColumn: selection.endColumn,
                        });
                    }
                });

                editorRef.current!.onDidChangeModelContent(() => {
                    handleCodeChange(editorRef.current!.getValue());
                });

                const currentValue = jotaiStore.get(editorValueAtom) || props.editorValue;
                editorRef.current!.setValue(currentValue);

                // Initialize cursor position AFTER setting value (setValue resets cursor to line 1)
                const currentPosition = editorRef.current!.getPosition();
                if (currentPosition) {
                    setCursorLine(currentPosition.lineNumber);
                }

                isInitializedRef.current = true;
                prevLanguageRef.current = props.language;

                // Notify parent that the editor is ready
                if (props.onEditorReady) {
                    props.onEditorReady(editorRef.current, monaco);
                }

                // Language server: started now if syntax checking is on, otherwise its worker
                // is terminated (and a new one is started when switched on).
                if (lspConfig.languageServerError) {
                    // Unreachable (e.g. Dafny proxy down): keep the editor, skip the client.
                    // Switching syntax checking off and on tries again.
                    terminateLanguageServerWorker(lspConfig.languageClientConfig);
                    if (languageFeaturesRef.current) reportLspFailure(lspConfig.languageServerError, props.language.short);
                } else {
                    pendingClientConfigRef.current = lspConfig.languageClientConfig;
                    if (session === sessionRef.current) syncLanguageClient();
                }
            } catch (error) {
                const failedConfig = lspConfig as LspConfig | null;
                if (failedConfig && pendingClientConfigRef.current !== failedConfig.languageClientConfig) {
                    terminateLanguageServerWorker(failedConfig.languageClientConfig);
                }
                if (cancelled) return;
                // The VS Code API or the editor itself failed: fall back to the CDN editor.
                console.error('Error initializing LSP editor, falling back to basic editor:', error);
                reportLspFailure(error, props.language.short);
                setLspFailed(true);
                // We do not dispose editorAppInstance here - it preserves the
                // global monaco-vscode-api state. It will be properly
                // disposed on the next startEditor call.
                isInitializedRef.current = false;
            }
        };

        startEditor();

        return () => {
            // Signal any in-progress async initialization to abort
            cancelled = true;
            sessionRef.current += 1;
            if (pendingClientConfigRef.current) {
                terminateLanguageServerWorker(pendingClientConfigRef.current);
                pendingClientConfigRef.current = null;
            }

            // Clean up cursor listener
            if (cursorListenerRef.current) {
                cursorListenerRef.current.dispose();
                cursorListenerRef.current = null;
            }

            shortcutDisposablesRef.current.forEach((d) => {
                if (d && typeof d.dispose === 'function') d.dispose();
            });
            shortcutDisposablesRef.current = [];

            // Only dispose the language client on unmount/language change. `true` also
            // terminates its language server worker; a new one is created on the next start.
            const lc = lcWrapperInstance;
            lcWrapperInstance = null;
            isInitializedRef.current = false;

            lc?.dispose(true).catch(console.error);
        };
    }, [props.language?.id]); // Only depend on language ID for initialization
    useEffect(() => {
        if (isInitializedRef.current && editorRef.current) {
            setEditorValue(props.editorValue);
        }
    }, [props.editorValue]);

    // Line highlighting effect - similar to Editor.tsx
    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            if (props.lineToHighlight !== null && props.lineToHighlight.length > 0) {
                const decorations = props.lineToHighlight.map((line) => {
                    return {
                        range: new monaco.Range(line, 1, line, 1),
                        options: {
                            isWholeLine: true,
                            className: 'lineHighlight',
                            glyphMarginClassName: 'lineHighlightGlyph',
                        },
                    };
                });
                const newDecorationIds = editor.deltaDecorations(decorationIds, decorations);
                setDecorationIds(newDecorationIds);
            } else {
                // Remove all decorations
                const newDecorationIds = editor.deltaDecorations(decorationIds, []);
                setDecorationIds(newDecorationIds);
            }
        }
    }, [props.lineToHighlight]);

    // Green highlighting for explain redundancy
    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            if (greenHighlight !== null && greenHighlight.length > 0) {
                const decorations = greenHighlight.map((line) => {
                    return {
                        range: new monaco.Range(line, 1, line, 1),
                        options: {
                            isWholeLine: true,
                            className: 'lineHighlightGreen',
                            glyphMarginClassName: 'lineHighlightGlyphGreen',
                        },
                    };
                });
                const newGreenDecorationIds = editor.deltaDecorations(greenDecorationIds, decorations);
                setGreenDecorationIds(newGreenDecorationIds);
            } else {
                // Remove all green decorations
                const newGreenDecorationIds = editor.deltaDecorations(greenDecorationIds, []);
                setGreenDecorationIds(newGreenDecorationIds);
            }
        }
    }, [greenHighlight]);

    // Range-based highlighting for precise assertion ranges
    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            const decorations: any[] = [];

            // Add target assertion range decoration (yellow)
            if (targetAssertionRange) {
                decorations.push({
                    range: new monaco.Range(
                        targetAssertionRange.startLine,
                        targetAssertionRange.startColumn,
                        targetAssertionRange.endLine,
                        targetAssertionRange.endColumn
                    ),
                    options: {
                        inlineClassName: 'inlineHighlightYellow',
                        className: 'rangeHighlightYellow',
                    },
                });
            }

            // Add minimal set ranges decorations (green)
            if (minimalSetRanges && minimalSetRanges.length > 0) {
                minimalSetRanges.forEach((range) => {
                    decorations.push({
                        range: new monaco.Range(range.startLine, range.startColumn, range.endLine, range.endColumn),
                        options: {
                            inlineClassName: 'inlineHighlightGreen',
                            className: 'rangeHighlightGreen',
                        },
                    });
                });
            }

            const newRangeDecorationIds = editor.deltaDecorations(rangeDecorationIds, decorations);
            setRangeDecorationIds(newRangeDecorationIds);
        }
    }, [targetAssertionRange, minimalSetRanges]);

    const setEditorValue = (value: string) => {
        if (editorRef.current) {
            const currentValue = editorRef.current.getValue();
            if (currentValue !== value) {
                const selection = editorRef.current.getSelection();
                editorRef.current.setValue(value);
                if (selection) {
                    editorRef.current.setSelection(selection);
                }
            }
        }
    };

    // Always keep the container div in the DOM so containerRef stays valid.
    // When LSP fails, show the fallback editor on top while keeping
    // the container available for future re-initialization attempts.
    return (
        <div className='custom-code-editor'>
            <div
                ref={containerRef}
                id='monaco-editor-root'
                style={{ height: props.height, display: lspFailed ? 'none' : undefined }}
            />
            {lspFailed && <Editor height={props.height} editorTheme={props.editorTheme || 'vs-dark'} onRunShortcut={props.onRunShortcut} />}
        </div>
    );
};

export default LspEditor;
