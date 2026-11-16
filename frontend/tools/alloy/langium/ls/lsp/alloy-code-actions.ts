import { CstUtils, DocumentValidator, type LangiumDocument, type MaybePromise } from 'langium';
import type { CodeActionProvider } from 'langium/lsp';
import { CodeActionKind, type CodeAction, type CodeActionParams, type Command, type Diagnostic } from 'vscode-languageserver';
import { isAtExpr, isQualName } from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';

/** Diagnostics fixed by deleting the flagged keyword. */
const REMOVABLE: Array<[RegExp, string]> = [
    [/^The exactly keyword is redundant here/, "Remove 'exactly'"],
    [/^The same qualifier cannot be specified more than once/, 'Remove the repeated qualifier'],
    [/^Subset signature cannot be abstract\./, "Remove 'abstract'"],
];

/**
 * Quick fixes:
 *  - "Did you mean ...?" replacements for names that cannot be resolved;
 *  - removing redundant or repeated keywords.
 */
export class AlloyCodeActionProvider implements CodeActionProvider {

    constructor(protected readonly services: AlloyServices) { }

    getCodeActions(document: LangiumDocument, params: CodeActionParams): MaybePromise<Array<Command | CodeAction>> {
        const actions: CodeAction[] = [];
        for (const diagnostic of params.context.diagnostics) {
            const removal = REMOVABLE.find(([pattern]) => pattern.test(diagnostic.message));
            if (removal) actions.push(this.removeAction(document, diagnostic, removal[1]));
            const data = diagnostic.data as { code?: string } | undefined;
            if (data?.code === DocumentValidator.LinkingError) actions.push(...this.suggestions(document, diagnostic));
        }
        return actions;
    }

    /** Deletes the flagged text and the whitespace after it. */
    protected removeAction(document: LangiumDocument, diagnostic: Diagnostic, title: string): CodeAction {
        const text = document.textDocument.getText();
        let end = document.textDocument.offsetAt(diagnostic.range.end);
        while (end < text.length && /[ \t]/.test(text[end])) end++;
        const range = { start: diagnostic.range.start, end: document.textDocument.positionAt(end) };
        return {
            title, kind: CodeActionKind.QuickFix, diagnostics: [diagnostic], isPreferred: true,
            edit: { changes: { [document.uri.toString()]: [{ range, newText: '' }] } }
        };
    }

    /** Names in scope that are close to an unresolved name. */
    protected suggestions(document: LangiumDocument, diagnostic: Diagnostic): CodeAction[] {
        const root = document.parseResult.value.$cstNode;
        const leaf = root && CstUtils.findLeafNodeAtOffset(root, document.textDocument.offsetAt(diagnostic.range.start));
        const node = leaf?.astNode;
        if (!node || !(isQualName(node) || isAtExpr(node))) return [];
        const unknown = node.ref.$refText;
        const scope = this.services.references.ScopeProvider.getScope({ container: node, property: 'ref', reference: node.ref });
        const names = new Set(scope.getAllElements().map(d => d.name).toArray());
        const maxDistance = unknown.length <= 3 ? 1 : 2;
        return [...names]
            .map(name => ({ name, distance: editDistance(unknown.toLowerCase(), name.toLowerCase()) }))
            .filter(c => c.distance <= maxDistance && c.name !== unknown)
            .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
            .slice(0, 3)
            .map((c, i) => ({
                title: `Did you mean '${c.name}'?`, kind: CodeActionKind.QuickFix, diagnostics: [diagnostic], isPreferred: i === 0,
                edit: { changes: { [document.uri.toString()]: [{ range: diagnostic.range, newText: c.name }] } }
            }));
    }
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[b.length];
}
