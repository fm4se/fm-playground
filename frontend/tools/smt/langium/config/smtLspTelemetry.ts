import * as vscode from 'vscode';
import type { Middleware } from 'vscode-languageclient';

export type SmtDiagnosticCategory = 'syntax' | 'linking' | 'naming' | 'command' | 'sort' | 'usage';

export interface SmtDiagnosticCategoryCounts {
    syntax: number;
    linking: number;
    naming: number;
    command: number;
    sort: number;
    usage: number;
}

export interface SmtLspEpisodeStats {
    /** Total wall-clock duration (ms) of this episode until execution/flush */
    episodeDurationMs: number;
    /** Duration (ms) from first document edit in this episode until flush (0 if no edits) */
    activeEditSpanMs: number;
    /** Number of textDocument/didChange events during this episode */
    documentChanges: number;
    /** Code completion telemetry */
    completions: {
        requested: number;
        shown: number;
        itemsOfferedTotal: number;
        accepted: number;
        acceptedByKind: Record<string, number>;
    };
    /** Hover tooltip telemetry */
    hovers: {
        requested: number;
        shown: number;
    };
    /** Signature help (operator/function sort hints) telemetry */
    signatureHelp: {
        requested: number;
        shown: number;
    };
    /** Quick-fix / code action telemetry */
    codeActions: {
        requested: number;
        shown: number;
        applied: number;
        appliedByKind: {
            replaceTypo: number;
            declareSymbol: number;
            other: number;
        };
    };
    /** Code navigation, symbol & formatting features */
    navigation: {
        definitions: number;
        references: number;
        documentSymbols: number;
        documentHighlights: number;
        renames: number;
        formats: number;
    };
    /**
     * Diagnostic lifecycle metrics.
     * Stabilized diagnostics are debounced (1.2s) to filter out transient mid-keystroke errors.
     * Keys are line-shift invariant so adding lines above an error does not falsely mark it resolved.
     */
    diagnostics: {
        stabilizedTotal: number;
        stabilizedErrors: number;
        stabilizedWarnings: number;
        stabilizedHints: number;
        stabilizedByCategory: SmtDiagnosticCategoryCounts;
        resolvedPreExecTotal: number;
        resolvedPreExecErrors: number;
        resolvedPreExecWarnings: number;
        resolvedPreExecHints: number;
        resolvedByCategory: SmtDiagnosticCategoryCounts;
        meanTimeToResolveMs: number | null;
        activeAtExecution: {
            errors: number;
            warnings: number;
            hints: number;
            byCategory: SmtDiagnosticCategoryCounts;
        };
    };
}

interface TrackedSmtDiagnostic {
    key: string;
    category: SmtDiagnosticCategory;
    severity: vscode.DiagnosticSeverity;
    stabilizedAt: number;
}

const STABILIZE_DEBOUNCE_MS = 1200;
const CMD_SMT_COMPLETION_ACCEPTED = 'smt.lsp.telemetry.completionAccepted';
const CMD_SMT_CODE_ACTION_APPLIED = 'smt.lsp.telemetry.codeActionApplied';

const COMPLETION_KIND_NAMES: Record<number, string> = {
    [vscode.CompletionItemKind.Text]: 'text',
    [vscode.CompletionItemKind.Method]: 'method',
    [vscode.CompletionItemKind.Function]: 'function',
    [vscode.CompletionItemKind.Constructor]: 'constructor',
    [vscode.CompletionItemKind.Field]: 'selector',
    [vscode.CompletionItemKind.Variable]: 'variable',
    [vscode.CompletionItemKind.Class]: 'sort',
    [vscode.CompletionItemKind.Interface]: 'interface',
    [vscode.CompletionItemKind.Module]: 'logic',
    [vscode.CompletionItemKind.Property]: 'attribute',
    [vscode.CompletionItemKind.Value]: 'value',
    [vscode.CompletionItemKind.Enum]: 'datatype',
    [vscode.CompletionItemKind.Keyword]: 'keyword',
    [vscode.CompletionItemKind.Snippet]: 'commandSnippet',
    [vscode.CompletionItemKind.Reference]: 'namedTerm',
    [vscode.CompletionItemKind.EnumMember]: 'datatypeCtor',
    [vscode.CompletionItemKind.Constant]: 'constant',
    [vscode.CompletionItemKind.TypeParameter]: 'sortParam',
};

function emptyCategoryCounts(): SmtDiagnosticCategoryCounts {
    return {
        syntax: 0,
        linking: 0,
        naming: 0,
        command: 0,
        sort: 0,
        usage: 0,
    };
}

export function categorizeSmtDiagnostic(diag: vscode.Diagnostic): SmtDiagnosticCategory {
    const rawData = (diag as unknown as { data?: { code?: string } }).data;
    const code = rawData?.code ?? (typeof diag.code === 'object' ? diag.code?.value : diag.code);

    if (code === 'lexing-error' || code === 'parsing-error') {
        return 'syntax';
    }
    if (code === 'linking-error') {
        return 'linking';
    }

    const msg = diag.message || '';
    if (msg.startsWith('This term is nested too deeply')) {
        return 'syntax';
    }
    if (
        /is declared but never used\.$/.test(msg) ||
        /is never used\.$/.test(msg) ||
        diag.tags?.includes(vscode.DiagnosticTag.Unnecessary)
    ) {
        return 'usage';
    }
    if (
        /is already declared/.test(msg) ||
        /cannot be redeclared\.$/.test(msg) ||
        /shadows a Z3 builtin sort/.test(msg) ||
        /^Duplicate constructor /.test(msg)
    ) {
        return 'naming';
    }
    if (
        /^Unknown (command|option|logic) /.test(msg) ||
        /^Option '.+' (requires|expects) /.test(msg) ||
        /^':(status|smt-lib-version)' must be /.test(msg) ||
        msg === 'The logic has already been set.' ||
        msg.startsWith("'set-logic' must come before") ||
        msg === 'The number of levels must be a non-negative numeral.' ||
        /^Cannot pop /.test(msg)
    ) {
        return 'command';
    }

    return 'sort';
}

class SmtLspTelemetryCollector {
    private episodeStartMs: number = Date.now();
    private firstEditMs: number | null = null;
    private documentChanges = 0;

    private completionsRequested = 0;
    private completionsShown = 0;
    private completionItemsOfferedTotal = 0;
    private completionsAccepted = 0;
    private completionsAcceptedByKind: Record<string, number> = {};

    private hoversRequested = 0;
    private hoversShown = 0;

    private signatureHelpRequested = 0;
    private signatureHelpShown = 0;

    private codeActionsRequested = 0;
    private codeActionsShown = 0;
    private codeActionsApplied = 0;
    private codeActionsAppliedByKind = {
        replaceTypo: 0,
        declareSymbol: 0,
        other: 0,
    };

    private definitionsCount = 0;
    private referencesCount = 0;
    private documentSymbolsCount = 0;
    private documentHighlightsCount = 0;
    private renamesCount = 0;
    private formatsCount = 0;

    private stabilizedTotal = 0;
    private stabilizedErrors = 0;
    private stabilizedWarnings = 0;
    private stabilizedHints = 0;
    private stabilizedByCategory: SmtDiagnosticCategoryCounts = emptyCategoryCounts();

    private resolvedPreExecTotal = 0;
    private resolvedPreExecErrors = 0;
    private resolvedPreExecWarnings = 0;
    private resolvedPreExecHints = 0;
    private resolvedByCategory: SmtDiagnosticCategoryCounts = emptyCategoryCounts();
    private totalResolveTimeMs = 0;
    private resolvedTimedCount = 0;

    private activeStabilizedMap = new Map<string, TrackedSmtDiagnostic>();
    private latestDiagnostics: vscode.Diagnostic[] = [];
    private stabilizeTimer: ReturnType<typeof setTimeout> | null = null;
    private commandsRegistered = false;

    public ensureCommandsRegistered(): void {
        if (this.commandsRegistered) return;
        try {
            if (vscode?.commands?.registerCommand) {
                vscode.commands.registerCommand(CMD_SMT_COMPLETION_ACCEPTED, (kind?: number) => {
                    this.recordCompletionAccepted(kind);
                });
                vscode.commands.registerCommand(CMD_SMT_CODE_ACTION_APPLIED, (title?: string) => {
                    this.recordCodeActionApplied(title);
                });
                this.commandsRegistered = true;
            }
        } catch {
            this.commandsRegistered = true;
        }
    }

    public recordDocumentChange(): void {
        if (this.firstEditMs === null) {
            this.firstEditMs = Date.now();
        }
        this.documentChanges++;
    }

    public recordCompletionResult(items: vscode.CompletionItem[]): void {
        this.completionsRequested++;
        if (items.length > 0) {
            this.completionsShown++;
            this.completionItemsOfferedTotal += items.length;
        }
    }

    public recordCompletionAccepted(kind?: number): void {
        this.completionsAccepted++;
        const kindKey = kind !== undefined ? (COMPLETION_KIND_NAMES[kind] ?? `kind_${kind}`) : 'unknown';
        this.completionsAcceptedByKind[kindKey] = (this.completionsAcceptedByKind[kindKey] ?? 0) + 1;
    }

    public recordHoverResult(hasHover: boolean): void {
        this.hoversRequested++;
        if (hasHover) {
            this.hoversShown++;
        }
    }

    public recordSignatureHelpResult(hasHelp: boolean): void {
        this.signatureHelpRequested++;
        if (hasHelp) {
            this.signatureHelpShown++;
        }
    }

    public recordCodeActionsResult(count: number): void {
        this.codeActionsRequested++;
        if (count > 0) {
            this.codeActionsShown++;
        }
    }

    public recordCodeActionApplied(title?: string): void {
        this.codeActionsApplied++;
        if (title?.startsWith('Replace with ')) {
            this.codeActionsAppliedByKind.replaceTypo++;
        } else if (title?.startsWith('Declare ')) {
            this.codeActionsAppliedByKind.declareSymbol++;
        } else {
            this.codeActionsAppliedByKind.other++;
        }
    }

    public recordDefinition(): void {
        this.definitionsCount++;
    }

    public recordReferences(): void {
        this.referencesCount++;
    }

    public recordDocumentSymbols(): void {
        this.documentSymbolsCount++;
    }

    public recordDocumentHighlights(): void {
        this.documentHighlightsCount++;
    }

    public recordRename(): void {
        this.renamesCount++;
    }

    public recordFormat(): void {
        this.formatsCount++;
    }

    /**
     * Builds line-shift-invariant keys for a list of diagnostics so editing lines
     * above an existing diagnostic does not falsely mark it as resolved.
     */
    private buildDiagnosticKeys(
        diagnostics: vscode.Diagnostic[]
    ): Map<string, { diag: vscode.Diagnostic; category: SmtDiagnosticCategory; severity: vscode.DiagnosticSeverity }> {
        const occurrenceCounts = new Map<string, number>();
        const keyed = new Map<
            string,
            { diag: vscode.Diagnostic; category: SmtDiagnosticCategory; severity: vscode.DiagnosticSeverity }
        >();

        for (const diag of diagnostics) {
            const category = categorizeSmtDiagnostic(diag);
            if (
                diag.severity !== vscode.DiagnosticSeverity.Error &&
                diag.severity !== vscode.DiagnosticSeverity.Warning &&
                !(diag.severity === vscode.DiagnosticSeverity.Hint && category === 'usage')
            ) {
                continue;
            }
            const sevTag =
                diag.severity === vscode.DiagnosticSeverity.Error
                    ? 'E'
                    : diag.severity === vscode.DiagnosticSeverity.Warning
                      ? 'W'
                      : 'H';
            const baseKey = `${category}:${sevTag}:${diag.message}`;
            const occ = (occurrenceCounts.get(baseKey) ?? 0) + 1;
            occurrenceCounts.set(baseKey, occ);
            keyed.set(`${baseKey}#${occ}`, { diag, category, severity: diag.severity });
        }

        return keyed;
    }

    public onDiagnosticsPublished(diagnostics: vscode.Diagnostic[]): void {
        this.latestDiagnostics = diagnostics;
        const currentKeyed = this.buildDiagnosticKeys(diagnostics);
        const now = Date.now();

        for (const [key, tracked] of this.activeStabilizedMap.entries()) {
            if (!currentKeyed.has(key)) {
                this.activeStabilizedMap.delete(key);
                this.resolvedPreExecTotal++;
                if (tracked.severity === vscode.DiagnosticSeverity.Error) {
                    this.resolvedPreExecErrors++;
                } else if (tracked.severity === vscode.DiagnosticSeverity.Warning) {
                    this.resolvedPreExecWarnings++;
                } else {
                    this.resolvedPreExecHints++;
                }
                this.resolvedByCategory[tracked.category]++;
                this.totalResolveTimeMs += Math.max(0, now - tracked.stabilizedAt);
                this.resolvedTimedCount++;
            }
        }

        if (this.stabilizeTimer) {
            clearTimeout(this.stabilizeTimer);
        }
        this.stabilizeTimer = setTimeout(() => {
            this.stabilizeCurrentDiagnostics();
        }, STABILIZE_DEBOUNCE_MS);
    }

    private stabilizeCurrentDiagnostics(): void {
        const currentKeyed = this.buildDiagnosticKeys(this.latestDiagnostics);
        const now = Date.now();

        for (const [key, info] of currentKeyed.entries()) {
            if (!this.activeStabilizedMap.has(key)) {
                this.activeStabilizedMap.set(key, {
                    key,
                    category: info.category,
                    severity: info.severity,
                    stabilizedAt: now,
                });
                this.stabilizedTotal++;
                if (info.severity === vscode.DiagnosticSeverity.Error) {
                    this.stabilizedErrors++;
                } else if (info.severity === vscode.DiagnosticSeverity.Warning) {
                    this.stabilizedWarnings++;
                } else {
                    this.stabilizedHints++;
                }
                this.stabilizedByCategory[info.category]++;
            }
        }
    }

    private computeActiveDiagnosticsSnapshot(): SmtLspEpisodeStats['diagnostics']['activeAtExecution'] {
        let errors = 0;
        let warnings = 0;
        let hints = 0;
        const byCategory = emptyCategoryCounts();

        for (const diag of this.latestDiagnostics) {
            const category = categorizeSmtDiagnostic(diag);
            if (diag.severity === vscode.DiagnosticSeverity.Error) {
                errors++;
                byCategory[category]++;
            } else if (diag.severity === vscode.DiagnosticSeverity.Warning) {
                warnings++;
                byCategory[category]++;
            } else if (diag.severity === vscode.DiagnosticSeverity.Hint && category === 'usage') {
                hints++;
                byCategory[category]++;
            }
        }

        return { errors, warnings, hints, byCategory };
    }

    public flushEpisodeStats(): SmtLspEpisodeStats {
        if (this.stabilizeTimer) {
            clearTimeout(this.stabilizeTimer);
            this.stabilizeTimer = null;
        }

        const now = Date.now();
        const stats: SmtLspEpisodeStats = {
            episodeDurationMs: Math.max(0, now - this.episodeStartMs),
            activeEditSpanMs: this.firstEditMs !== null ? Math.max(0, now - this.firstEditMs) : 0,
            documentChanges: this.documentChanges,
            completions: {
                requested: this.completionsRequested,
                shown: this.completionsShown,
                itemsOfferedTotal: this.completionItemsOfferedTotal,
                accepted: this.completionsAccepted,
                acceptedByKind: { ...this.completionsAcceptedByKind },
            },
            hovers: {
                requested: this.hoversRequested,
                shown: this.hoversShown,
            },
            signatureHelp: {
                requested: this.signatureHelpRequested,
                shown: this.signatureHelpShown,
            },
            codeActions: {
                requested: this.codeActionsRequested,
                shown: this.codeActionsShown,
                applied: this.codeActionsApplied,
                appliedByKind: { ...this.codeActionsAppliedByKind },
            },
            navigation: {
                definitions: this.definitionsCount,
                references: this.referencesCount,
                documentSymbols: this.documentSymbolsCount,
                documentHighlights: this.documentHighlightsCount,
                renames: this.renamesCount,
                formats: this.formatsCount,
            },
            diagnostics: {
                stabilizedTotal: this.stabilizedTotal,
                stabilizedErrors: this.stabilizedErrors,
                stabilizedWarnings: this.stabilizedWarnings,
                stabilizedHints: this.stabilizedHints,
                stabilizedByCategory: { ...this.stabilizedByCategory },
                resolvedPreExecTotal: this.resolvedPreExecTotal,
                resolvedPreExecErrors: this.resolvedPreExecErrors,
                resolvedPreExecWarnings: this.resolvedPreExecWarnings,
                resolvedPreExecHints: this.resolvedPreExecHints,
                resolvedByCategory: { ...this.resolvedByCategory },
                meanTimeToResolveMs:
                    this.resolvedTimedCount > 0
                        ? Math.round(this.totalResolveTimeMs / this.resolvedTimedCount)
                        : null,
                activeAtExecution: this.computeActiveDiagnosticsSnapshot(),
            },
        };

        this.resetEpisodeCounters(now);
        return stats;
    }

    public hasUnflushedActivity(): boolean {
        return (
            this.documentChanges > 0 ||
            this.completionsAccepted > 0 ||
            this.hoversShown > 0 ||
            this.codeActionsApplied > 0 ||
            this.resolvedPreExecTotal > 0 ||
            this.definitionsCount > 0 ||
            this.referencesCount > 0 ||
            this.formatsCount > 0
        );
    }

    public resetEpisodeCounters(now: number = Date.now()): void {
        this.episodeStartMs = now;
        this.firstEditMs = null;
        this.documentChanges = 0;

        this.completionsRequested = 0;
        this.completionsShown = 0;
        this.completionItemsOfferedTotal = 0;
        this.completionsAccepted = 0;
        this.completionsAcceptedByKind = {};

        this.hoversRequested = 0;
        this.hoversShown = 0;

        this.signatureHelpRequested = 0;
        this.signatureHelpShown = 0;

        this.codeActionsRequested = 0;
        this.codeActionsShown = 0;
        this.codeActionsApplied = 0;
        this.codeActionsAppliedByKind = {
            replaceTypo: 0,
            declareSymbol: 0,
            other: 0,
        };

        this.definitionsCount = 0;
        this.referencesCount = 0;
        this.documentSymbolsCount = 0;
        this.documentHighlightsCount = 0;
        this.renamesCount = 0;
        this.formatsCount = 0;

        this.stabilizedTotal = 0;
        this.stabilizedErrors = 0;
        this.stabilizedWarnings = 0;
        this.stabilizedHints = 0;
        this.stabilizedByCategory = emptyCategoryCounts();

        this.resolvedPreExecTotal = 0;
        this.resolvedPreExecErrors = 0;
        this.resolvedPreExecWarnings = 0;
        this.resolvedPreExecHints = 0;
        this.resolvedByCategory = emptyCategoryCounts();
        this.totalResolveTimeMs = 0;
        this.resolvedTimedCount = 0;
    }

    public createMiddleware(): Middleware {
        return {
            didChange: async (event, next) => {
                this.ensureCommandsRegistered();
                this.recordDocumentChange();
                return next(event);
            },
            provideCompletionItem: async (document, position, context, token, next) => {
                this.ensureCommandsRegistered();
                const res = await next(document, position, context, token);
                const items = Array.isArray(res) ? res : res?.items ?? [];
                this.recordCompletionResult(items);

                for (const item of items) {
                    if (!item.command) {
                        item.command = {
                            command: CMD_SMT_COMPLETION_ACCEPTED,
                            title: '',
                            arguments: [item.kind],
                        };
                    }
                }
                return res;
            },
            provideHover: async (document, position, token, next) => {
                this.ensureCommandsRegistered();
                const res = await next(document, position, token);
                const hasContents = Boolean(
                    res && Array.isArray(res.contents) ? res.contents.length > 0 : res?.contents
                );
                this.recordHoverResult(hasContents);
                return res;
            },
            provideSignatureHelp: async (document, position, context, token, next) => {
                this.ensureCommandsRegistered();
                const res = await next(document, position, context, token);
                this.recordSignatureHelpResult(Boolean(res && res.signatures && res.signatures.length > 0));
                return res;
            },
            provideCodeActions: async (document, range, context, token, next) => {
                this.ensureCommandsRegistered();
                const res = await next(document, range, context, token);
                const actions = res ?? [];
                this.recordCodeActionsResult(actions.length);

                for (const action of actions) {
                    if (action && typeof action === 'object' && 'title' in action && 'edit' in action && !action.command) {
                        action.command = {
                            command: CMD_SMT_CODE_ACTION_APPLIED,
                            title: '',
                            arguments: [action.title],
                        };
                    }
                }
                return res;
            },
            provideDefinition: async (document, position, token, next) => {
                const res = await next(document, position, token);
                if (res && (!Array.isArray(res) || res.length > 0)) {
                    this.recordDefinition();
                }
                return res;
            },
            provideReferences: async (document, position, options, token, next) => {
                const res = await next(document, position, options, token);
                if (res && res.length > 0) {
                    this.recordReferences();
                }
                return res;
            },
            provideDocumentSymbols: async (document, token, next) => {
                const res = await next(document, token);
                if (res && res.length > 0) {
                    this.recordDocumentSymbols();
                }
                return res;
            },
            provideDocumentHighlights: async (document, position, token, next) => {
                const res = await next(document, position, token);
                if (res && res.length > 0) {
                    this.recordDocumentHighlights();
                }
                return res;
            },
            provideRenameEdits: async (document, position, newName, token, next) => {
                const res = await next(document, position, newName, token);
                if (res) {
                    this.recordRename();
                }
                return res;
            },
            provideDocumentFormattingEdits: async (document, options, token, next) => {
                const res = await next(document, options, token);
                if (res && res.length > 0) {
                    this.recordFormat();
                }
                return res;
            },
            handleDiagnostics: (uri, diagnostics, next) => {
                if (uri.toString().endsWith('.smt2')) {
                    this.onDiagnosticsPublished(diagnostics);
                }
                next(uri, diagnostics);
            },
        };
    }
}

export const smtLspTelemetry = new SmtLspTelemetryCollector();
