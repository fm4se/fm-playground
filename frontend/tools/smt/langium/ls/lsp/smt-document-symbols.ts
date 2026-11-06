import type { AstNode, LangiumDocument, MaybePromise } from 'langium';
import type { DocumentSymbolProvider, NodeKindProvider } from 'langium/lsp';
import type { DocumentSymbol, DocumentSymbolParams } from 'vscode-languageserver';
import {
    isDeclareConst, isDeclareDatatype, isDeclareDatatypes, isDeclareFun, isDeclareRel, isDeclareSort, isDeclareSortParameter,
    isDeclareVar, isDefineConst, isDefineFun, isDefineFunsRec, isDefineSort, isNamedAttribute,
    type ConstructorDec, type Script
} from '../generated/ast.js';
import { AstUtils, GrammarUtils } from 'langium';
import type { SmtServices } from '../smt-module.js';

/** Outline: global declarations, datatypes with their constructors and selectors, and named terms. */
export class SmtDocumentSymbolProvider implements DocumentSymbolProvider {

    protected readonly nodeKindProvider: NodeKindProvider;

    constructor(services: SmtServices) {
        this.nodeKindProvider = services.shared.lsp.NodeKindProvider;
    }

    getSymbols(document: LangiumDocument, _params: DocumentSymbolParams): MaybePromise<DocumentSymbol[]> {
        const symbols: DocumentSymbol[] = [];
        for (const command of (document.parseResult.value as Script).commands) {
            if (isDeclareConst(command) || isDeclareFun(command) || isDefineConst(command) || isDeclareRel(command) || isDeclareVar(command)
                || isDeclareSort(command) || isDeclareSortParameter(command) || isDefineSort(command)) {
                this.push(symbols, command, command.name, command, 'sort' in command ? command.sort?.$cstNode?.text : undefined);
            } else if (isDefineFun(command) && command.definition) {
                this.push(symbols, command.definition, command.definition.name, command, command.definition.sort?.$cstNode?.text);
            } else if (isDefineFunsRec(command)) {
                command.declarations.forEach(d => this.push(symbols, d, d.name, d, d.sort?.$cstNode?.text));
            } else if (isDeclareDatatype(command)) {
                this.push(symbols, command, command.name, command, 'datatype', this.constructors(command.datatype?.constructors ?? []));
            } else if (isDeclareDatatypes(command)) {
                command.sorts.forEach((s, i) => this.push(symbols, s, s.name, s, 'datatype', this.constructors(command.datatypes[i]?.constructors ?? [])));
                command.legacyDatatypes.forEach(d => this.push(symbols, d, d.name, d, 'datatype', this.constructors(d.constructors)));
            }
            for (const node of AstUtils.streamAst(command)) {
                if (isNamedAttribute(node)) this.push(symbols, node, node.name, node, 'named');
            }
        }
        return symbols;
    }

    private constructors(ctors: ConstructorDec[]): DocumentSymbol[] {
        const result: DocumentSymbol[] = [];
        for (const ctor of ctors) {
            const children: DocumentSymbol[] = [];
            ctor.selectors.forEach(sel => this.push(children, sel, sel.name, sel, sel.sort?.$cstNode?.text));
            this.push(result, ctor, ctor.name, ctor, 'constructor', children);
        }
        return result;
    }

    private push(into: DocumentSymbol[], node: AstNode, name: string | undefined, rangeNode: AstNode, detail?: string, children?: DocumentSymbol[]): void {
        const cst = rangeNode.$cstNode;
        if (!cst || !name) return;
        into.push({
            name, detail, kind: this.nodeKindProvider.getSymbolKind(node),
            range: cst.range, selectionRange: findNameRange(node) ?? cst.range,
            children
        });
    }
}

function findNameRange(node: AstNode) {
    return GrammarUtils.findNodeForProperty(node.$cstNode, 'name')?.range;
}
