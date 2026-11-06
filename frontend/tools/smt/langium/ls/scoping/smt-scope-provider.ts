/**
 * Scoping for SMT-LIB scripts.
 *
 * A symbol is resolved, in this order, against
 *  1. local binders enclosing the reference (innermost first): function parameters,
 *     `let` bindings, quantifier / lambda variables, `match` pattern variables, and for
 *     sorts the parameters of `par`, `define-sort` and legacy datatype declarations;
 *  2. global declarations of the same document that are visible at the reference
 *     (see SymbolTable: declare-before-use, push/pop, reset);
 *  3. the builtin library (theory symbols of SMT-LIB and Z3).
 *
 * Function symbols and sort symbols live in separate namespaces. Scripts do not see
 * declarations of other documents.
 */
import {
    AstUtils, DocumentCache, EMPTY_STREAM, stream,
    type AstNode, type AstNodeDescription, type AstNodeDescriptionProvider, type AstReflection,
    type LangiumDocument, type ReferenceInfo, type Scope, type ScopeProvider, type Stream
} from 'langium';
import {
    isConstructorDec, isConstructorPattern, isDatatypeDec, isDeclareDatatypes, isDefineFunsRec, isDefineSort, isFunctionDef,
    isLambdaTerm, isLetTerm, isMatchCase, isPatternVariable, isQuantifiedTerm,
    type PatternVariable
} from '../generated/ast.js';
import type { BuiltinLibrary } from '../builtins/library.js';
import type { SmtServices } from '../smt-module.js';
import { SymbolTable, type Namespace } from './symbol-table.js';

type Layer = Map<string, AstNodeDescription>;

export class SmtScopeProvider implements ScopeProvider {

    protected readonly reflection: AstReflection;
    protected readonly descriptions: AstNodeDescriptionProvider;
    protected readonly builtins: BuiltinLibrary;
    protected readonly symbolTables: DocumentCache<string, SymbolTable>;
    protected readonly layerCache = new WeakMap<AstNode, Layer>();

    constructor(services: SmtServices) {
        this.reflection = services.shared.AstReflection;
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
        this.builtins = services.builtins.BuiltinLibrary;
        this.symbolTables = new DocumentCache(services.shared);
    }

    getSymbolTable(document: LangiumDocument): SymbolTable {
        return this.symbolTables.get(document.uri, 'table', () => new SymbolTable(document, this.descriptions));
    }

    getScope(context: ReferenceInfo): Scope {
        return this.getScopeAt(context, context.container.$cstNode?.offset);
    }

    /**
     * The scope of a reference at an explicit offset. Code completion uses this, since it
     * works on synthetic nodes that have no position in the text.
     */
    getScopeAt(context: ReferenceInfo, offset: number | undefined): Scope {
        const namespace: Namespace = this.reflection.getReferenceType(context) === 'SortSymbol' ? 'sort' : 'function';
        const document = AstUtils.getDocument(context.container);
        if (this.builtins.isBuiltinDocument(document)) {
            return new SmtScope(namespace, [], undefined, 0, this.builtins);
        }
        offset ??= findOffset(context.container);
        const table = this.getSymbolTable(document);
        const layers = this.collectLayers(context.container, namespace, table, offset);
        return new SmtScope(namespace, layers, table, offset, this.builtins);
    }

    /**
     * Returns the global symbol or builtin a name resolves to at the given position,
     * ignoring local binders.
     */
    resolveGlobal(document: LangiumDocument, name: string, namespace: Namespace, offset: number): AstNodeDescription | undefined {
        return new SmtScope(namespace, [], this.getSymbolTable(document), offset, this.builtins).getElement(name);
    }

    /** Local binder layers enclosing `node`, innermost first. */
    protected collectLayers(node: AstNode, namespace: Namespace, table: SymbolTable, offset: number): Layer[] {
        const layers: Layer[] = [];
        let child: AstNode = node;
        let current = node.$container;
        while (current) {
            const layer = namespace === 'function'
                ? this.functionLayer(current, child, table, offset)
                : this.sortLayer(current, child);
            if (layer && layer.size > 0) layers.push(layer);
            child = current;
            current = current.$container;
        }
        return layers;
    }

    protected functionLayer(node: AstNode, child: AstNode, table: SymbolTable, offset: number): Layer | undefined {
        if (isFunctionDef(node) && child === node.body) {
            return this.layer(node, () => node.parameters);
        }
        if (isDefineFunsRec(node)) {
            const index = node.bodies.indexOf(child as never);
            if (index >= 0 && node.declarations[index]) {
                const dec = node.declarations[index];
                return this.layer(dec, () => dec.parameters);
            }
            return undefined;
        }
        if (isLetTerm(node) && child === node.body) {
            return this.layer(node, () => node.bindings);
        }
        if ((isQuantifiedTerm(node) || isLambdaTerm(node)) && child === node.body) {
            return this.layer(node, () => node.variables);
        }
        if (isMatchCase(node) && child === node.body) {
            const pattern = node.pattern;
            if (isConstructorPattern(pattern)) {
                return this.layer(node, () => pattern.arguments.filter(v => v.name !== '_'));
            }
            if (isPatternVariable(pattern) && this.isVariablePattern(pattern, table, offset)) {
                return this.layer(node, () => [pattern]);
            }
        }
        return undefined;
    }

    protected sortLayer(node: AstNode, child: AstNode): Layer | undefined {
        if (isDatatypeDec(node) && node.parameters.length > 0) {
            return this.layer(node, () => node.parameters);
        }
        if (isDefineSort(node) && child === node.sort) {
            return this.layer(node, () => node.parameters);
        }
        if (isDeclareDatatypes(node) && node.parameters.length > 0) {
            return this.layer(node, () => node.parameters);
        }
        return undefined;
    }

    /** A bare pattern symbol binds a variable unless it names a nullary constructor. */
    isVariablePattern(pattern: PatternVariable, table: SymbolTable, offset: number): boolean {
        if (pattern.name === '_') return false;
        return !table.lookup(pattern.name, 'function', offset).some(s => isConstructorDec(s.node));
    }

    protected layer(owner: AstNode, elements: () => Array<AstNode & { name: string }>): Layer {
        let layer = this.layerCache.get(owner);
        if (!layer) {
            layer = new Map();
            const document = AstUtils.getDocument(owner);
            for (const element of elements()) {
                if (element.name) layer.set(element.name, this.descriptions.createDescription(element, element.name, document));
            }
            this.layerCache.set(owner, layer);
        }
        return layer;
    }
}

/**
 * The scope of one reference. Besides plain names it resolves `is-C` (Z3's tester
 * naming) to the constructor `C` and the bit-vector literal family `bvN` to the
 * builtin `bv`.
 */
export class SmtScope implements Scope {

    constructor(
        protected readonly namespace: Namespace,
        protected readonly layers: Layer[],
        protected readonly table: SymbolTable | undefined,
        protected readonly offset: number,
        protected readonly builtins: BuiltinLibrary
    ) { }

    getElement(name: string): AstNodeDescription | undefined {
        for (const layer of this.layers) {
            const local = layer.get(name);
            if (local) return local;
        }
        if (this.table) {
            const global = this.table.lookup(name, this.namespace, this.offset)[0];
            if (global) return this.table.describe(global);
        }
        if (this.namespace === 'sort') {
            return this.builtins.getSortDescription(name);
        }
        const builtin = this.builtins.getFunctionDescription(name);
        if (builtin) return builtin;
        if (this.table && name.startsWith('is-') && name.length > 3) {
            const ctor = this.table.lookup(name.slice(3), 'function', this.offset).find(s => isConstructorDec(s.node));
            if (ctor) return this.table.describe(ctor);
        }
        return undefined;
    }

    getElements(name: string): Stream<AstNodeDescription> {
        const element = this.getElement(name);
        return element ? stream([element]) : EMPTY_STREAM;
    }

    getAllElements(): Stream<AstNodeDescription> {
        const seen = new Set<string>();
        const result: AstNodeDescription[] = [];
        const accept = (d: AstNodeDescription) => {
            if (!seen.has(d.name)) {
                seen.add(d.name);
                result.push(d);
            }
        };
        for (const layer of this.layers) layer.forEach(accept);
        if (this.table) {
            for (const symbol of this.table.visibleAt(this.namespace, this.offset)) accept(this.table.describe(symbol));
        }
        const builtins = this.namespace === 'sort' ? this.builtins.getAllSortDescriptions() : this.builtins.getAllFunctionDescriptions();
        builtins.forEach(accept);
        return stream(result);
    }
}

function findOffset(node: AstNode): number {
    let current: AstNode | undefined = node;
    while (current) {
        if (current.$cstNode) return current.$cstNode.offset;
        current = current.$container;
    }
    return 0;
}
