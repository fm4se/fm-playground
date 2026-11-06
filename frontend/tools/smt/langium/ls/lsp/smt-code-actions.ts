import { AstUtils, CstUtils, DocumentValidator, type AstNode, type LangiumDocument, type MaybePromise } from 'langium';
import type { CodeActionProvider } from 'langium/lsp';
import { CodeActionKind, type CodeAction, type CodeActionParams, type Command, type Diagnostic } from 'vscode-languageserver';
import { isApplication, isAssert, isSimpleIdentifier, type Script } from '../generated/ast.js';
import type { SmtServices } from '../smt-module.js';
import { printSymbol } from '../typing/sorts.js';

/**
 * Quick fixes:
 *  - "Did you mean ..." replacements for unknown symbols, sorts and commands;
 *  - declaring an unknown constant/function/sort before the command that uses it.
 */
export class SmtCodeActionProvider implements CodeActionProvider {

    constructor(protected readonly services: SmtServices) { }

    getCodeActions(document: LangiumDocument, params: CodeActionParams): MaybePromise<Array<Command | CodeAction>> {
        const actions: CodeAction[] = [];
        for (const diagnostic of params.context.diagnostics) {
            const suggestion = diagnostic.message.match(/Did you mean '([^']+)'\?/)?.[1];
            if (suggestion) {
                actions.push({
                    title: `Replace with '${suggestion}'`, kind: CodeActionKind.QuickFix, diagnostics: [diagnostic], isPreferred: true,
                    edit: { changes: { [document.uri.toString()]: [{ range: diagnostic.range, newText: printSymbol(suggestion) }] } }
                });
            }
            const data = diagnostic.data as { code?: string; refText?: string; containerType?: string } | undefined;
            if (data?.code === DocumentValidator.LinkingError && data.refText && /^Unknown (symbol|sort)/.test(diagnostic.message)) {
                const action = this.declareAction(document, diagnostic, data.refText, data.containerType ?? '');
                if (action) actions.push(action);
            }
        }
        return actions;
    }

    protected declareAction(document: LangiumDocument, diagnostic: Diagnostic, name: string, containerType: string): CodeAction | undefined {
        const root = document.parseResult.value.$cstNode;
        if (!root) return undefined;
        const offset = document.textDocument.offsetAt(diagnostic.range.start);
        const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
        const node = leaf?.astNode;
        if (!node) return undefined;
        const command = topLevelCommand(node);
        if (!command?.$cstNode) return undefined;
        const symbol = printSymbol(name);
        let declaration: string;
        let title: string;
        if (containerType === 'SimpleSort' || containerType === 'IndexedSort') {
            declaration = `(declare-sort ${symbol} 0)`;
            title = `Declare sort '${name}'`;
        } else {
            const application = isSimpleIdentifier(node) && isApplication(node.$container) && node.$container.function === node ? node.$container : undefined;
            if (application) {
                const params = application.arguments.map(() => 'Int').join(' ');
                declaration = `(declare-fun ${symbol} (${params}) Int)`;
                title = `Declare function '${name}'`;
            } else {
                const sort = isAssert(node.$container) ? 'Bool' : 'Int';
                declaration = `(declare-const ${symbol} ${sort})`;
                title = `Declare constant '${name}'`;
            }
        }
        const start = document.textDocument.positionAt(command.$cstNode.offset);
        const indent = document.textDocument.getText({ start: { line: start.line, character: 0 }, end: start });
        return {
            title, kind: CodeActionKind.QuickFix, diagnostics: [diagnostic],
            edit: { changes: { [document.uri.toString()]: [{ range: { start, end: start }, newText: `${declaration}\n${indent}` }] } }
        };
    }
}

function topLevelCommand(node: AstNode): AstNode | undefined {
    const script = AstUtils.getContainerOfType(node, (n): n is Script => n.$type === 'Script');
    let current: AstNode | undefined = node;
    while (current && current.$container !== script) current = current.$container;
    return current;
}
