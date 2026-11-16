import { GrammarUtils, type AstNode, type LangiumDocument, type MaybePromise } from 'langium';
import type { DocumentSymbolProvider, NodeKindProvider } from 'langium/lsp';
import type { DocumentSymbol, DocumentSymbolParams } from 'vscode-languageserver';
import {
    isAssertDecl, isCmdDecl, isEnumDecl, isFactDecl, isFunDecl, isMacroDecl, isModuleDecl, isPredDecl, isSigDecl,
    type AlloyModule, type CmdDecl
} from '../generated/ast.js';
import type { AlloyServices } from '../alloy-module.js';
import { textOf } from '../typing/type-checker.js';
import { callableSignature } from './describe.js';

/** Outline: module parameters, sigs with their fields, enums, predicates, functions, facts, assertions and commands. */
export class AlloyDocumentSymbolProvider implements DocumentSymbolProvider {

    protected readonly nodeKindProvider: NodeKindProvider;

    constructor(services: AlloyServices) {
        this.nodeKindProvider = services.shared.lsp.NodeKindProvider;
    }

    getSymbols(document: LangiumDocument, _params: DocumentSymbolParams): MaybePromise<DocumentSymbol[]> {
        const module = document.parseResult.value as AlloyModule;
        const symbols: DocumentSymbol[] = [];
        if (isModuleDecl(module)) {
            module.params.forEach(p => this.push(symbols, p, p.name, p, 'module parameter'));
        }
        for (const p of module.paragraph) {
            if (isSigDecl(p)) {
                const fields: DocumentSymbol[] = [];
                for (const field of p.fields) {
                    field?.decl.names.forEach(n => this.push(fields, n, n.name, field, textOf(field.decl.expr)));
                }
                const ext = p.sigExt ? textOf(p.sigExt) : undefined;
                this.push(symbols, p, p.name, p, ext, fields);
                p.additionalSigs.forEach(s => this.push(symbols, s, s.name, s, ext));
            } else if (isEnumDecl(p)) {
                const values: DocumentSymbol[] = [];
                p.values.forEach(v => this.push(values, v, v.name, v));
                this.push(symbols, p, p.name, p, 'enum', values);
            } else if (isPredDecl(p) || isFunDecl(p)) {
                this.push(symbols, p, p.name, p, callableSignature(p).replace(/^\w+ /, ''));
            } else if (isFactDecl(p)) {
                this.push(symbols, p, p.name ?? 'fact', p, 'fact');
            } else if (isAssertDecl(p)) {
                this.push(symbols, p, p.name ?? 'assert', p, 'assert');
            } else if (isMacroDecl(p)) {
                this.push(symbols, p, p.name, p, 'macro');
            } else if (isCmdDecl(p)) {
                this.push(symbols, p, commandLabel(p), p, p.scope ? textOf(p.scope) : undefined);
            }
        }
        return symbols;
    }

    protected push(into: DocumentSymbol[], node: AstNode, name: string | undefined, rangeNode: AstNode, detail?: string, children?: DocumentSymbol[]): void {
        const cst = rangeNode.$cstNode;
        if (!cst || !name) return;
        const selection = GrammarUtils.findNodeForProperty(node.$cstNode, 'name')?.range ?? cst.range;
        into.push({ name, detail, kind: this.nodeKindProvider.getSymbolKind(node), range: cst.range, selectionRange: selection, children });
    }
}

/** "run show", "check NoCycles" or the command's label. */
function commandLabel(cmd: CmdDecl): string {
    if (cmd.predicate) {
        const label = `${cmd.kind} ${textOf(cmd.predicate)}`;
        return cmd.name ? `${cmd.name}: ${label}` : label;
    }
    return cmd.name ? `${cmd.kind} ${cmd.name}` : `${cmd.kind} {...}`;
}
