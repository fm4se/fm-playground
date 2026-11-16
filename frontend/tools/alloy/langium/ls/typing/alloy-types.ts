/**
 * Relational types of Alloy expressions, following edu.mit.csail.sdg.ast.Type.
 *
 * A type is a union of product types (tuples of primitive signatures), plus flags for
 * formulas and integer expressions. Primitive signatures form a tree rooted at univ;
 * subset signatures have no primitive signature of their own, their type is the union
 * of their parents' types.
 *
 * Two extensions keep the checker lenient:
 *  - UNKNOWN stands for any type (unresolved names, macros, unsupported constructs) and
 *    makes every operation succeed without reporting problems;
 *  - module parameters (module util/ordering[elem]) are parameter signatures that
 *    overlap with every signature.
 */
import type { AstNode } from 'langium';

export class PrimSig {
    constructor(
        /** Name of the signature, e.g. "Person". */
        readonly name: string,
        /** Parent in the extension hierarchy; undefined for univ and none. */
        readonly parent: PrimSig | undefined,
        /** Declaring node (SigDecl, AdditionalSig, EnumDecl, EnumValue or ModuleParam); undefined for builtins. */
        readonly node?: AstNode,
        /** Path of the declaring module (e.g. "util/ordering"); undefined for the main module and builtins. */
        readonly modulePath?: string,
        /** True for a module parameter, which may be instantiated with any signature. */
        readonly isParam = false
    ) { }

    /** True if this is that or a descendant of that; none is below and univ above everything. */
    isSameOrDescendentOf(that: PrimSig): boolean {
        if (this === NONE || this === that || that === UNIV) return true;
        if (this === UNIV || that === NONE) return false;
        for (let me: PrimSig | undefined = this; me; me = me.parent) {
            if (me === that) return true;
        }
        return false;
    }

    /** The common descendant of this and that, or none; a parameter intersects everything. */
    intersect(that: PrimSig): PrimSig {
        if (this.isSameOrDescendentOf(that)) return this;
        if (that.isSameOrDescendentOf(this)) return that;
        if (this.isParam && that !== NONE) return that;
        if (that.isParam && this !== NONE) return this;
        return NONE;
    }

    intersects(that: PrimSig): boolean {
        return this.intersect(that) !== NONE;
    }
}

export const UNIV = new PrimSig('univ', undefined);
export const NONE = new PrimSig('none', undefined);
export const INT = new PrimSig('Int', UNIV);
export const STRING = new PrimSig('String', UNIV);

export type Product = readonly PrimSig[];

/** True if the product has no tuples (arity 0 or a none column). */
function isEmptyProduct(p: Product): boolean {
    return p.length === 0 || p[0] === NONE;
}

function isSubProduct(a: Product, b: Product): boolean {
    if (a.length !== b.length) return false;
    if (isEmptyProduct(a)) return true;
    return a.every((s, i) => s.isSameOrDescendentOf(b[i]));
}

function emptyProduct(arity: number): Product {
    return new Array<PrimSig>(arity).fill(NONE);
}

function intersectProducts(a: Product, b: Product): Product {
    if (isEmptyProduct(a)) return a;
    if (isEmptyProduct(b)) return b;
    const result: PrimSig[] = [];
    for (let i = 0; i < a.length; i++) {
        const c = a[i].intersect(b[i]);
        if (c === NONE) return emptyProduct(a.length);
        result.push(c);
    }
    return result;
}

export class AlloyType {

    private constructor(
        readonly products: readonly Product[],
        /** True for a formula. */
        readonly isBool: boolean,
        /** True for an integer expression such as #s or 3 (its relational part is {Int}). */
        readonly isSmallInt: boolean,
        /** True for a type that could not be determined; it is compatible with everything. */
        readonly isUnknown: boolean
    ) { }

    static readonly EMPTY = new AlloyType([], false, false, false);
    static readonly FORMULA = new AlloyType([], true, false, false);
    static readonly UNKNOWN = new AlloyType([], false, false, true);
    static readonly SMALL_INT = new AlloyType([[INT]], false, true, false);

    /** Builds a type from products, dropping duplicates and products subsumed by others. */
    static of(products: Iterable<Product>, isBool = false, isSmallInt = false): AlloyType {
        const entries: Product[] = [];
        for (const p of products) add(entries, p);
        return new AlloyType(entries, isBool, isSmallInt, false);
    }

    static unary(sig: PrimSig): AlloyType {
        return AlloyType.of([[sig]]);
    }

    get size(): number {
        return this.products.length;
    }

    arities(): Set<number> {
        return new Set(this.products.map(p => p.length));
    }

    hasArity(arity: number): boolean {
        return this.products.some(p => p.length === arity);
    }

    /** The arity if all products share one, otherwise undefined. */
    arity(): number | undefined {
        const arities = this.arities();
        return arities.size === 1 ? [...arities][0] : undefined;
    }

    hasTuple(): boolean {
        return this.products.some(p => !isEmptyProduct(p));
    }

    hasNoTuple(): boolean {
        return !this.hasTuple();
    }

    /** True for an integer expression or a set of Int atoms (Alloy's is_int). */
    isInt(): boolean {
        return this.products.some(p => p.length === 1 && p[0] === INT);
    }

    /** True for a set or relation (or an integer, which is the set of its Int atom). */
    isSet(): boolean {
        return this.products.length > 0;
    }

    hasCommonArity(that: AlloyType): boolean {
        const mine = this.arities();
        return [...that.arities()].some(a => mine.has(a));
    }

    /** Union of all products of both types. */
    merge(that: AlloyType): AlloyType {
        return AlloyType.of([...this.products, ...that.products], this.isBool || that.isBool, false);
    }

    /** { A | A in this or that, and A's arity occurs in both } */
    unionWithCommonArity(that: AlloyType): AlloyType {
        const mine = this.arities(), theirs = that.arities();
        return AlloyType.of([...this.products.filter(p => theirs.has(p.length)), ...that.products.filter(p => mine.has(p.length))]);
    }

    /** { A in this | A's arity occurs in that } */
    pickCommonArity(that: AlloyType): AlloyType {
        const theirs = that.arities();
        return AlloyType.of(this.products.filter(p => theirs.has(p.length)));
    }

    /** { A & B | A in this, B in that, same arity } */
    intersect(that: AlloyType): AlloyType {
        const result: Product[] = [];
        for (const a of this.products) {
            for (const b of that.products) {
                if (a.length === b.length) result.push(intersectProducts(a, b));
            }
        }
        return AlloyType.of(result);
    }

    /** True if { A & B | A in this, B in that } can have tuples. */
    intersects(that: AlloyType): boolean {
        return this.products.some(a => !isEmptyProduct(a) && that.products.some(b =>
            a.length === b.length && !isEmptyProduct(intersectProducts(a, b))));
    }

    /** { A->B | A in this, B in that } */
    product(that: AlloyType): AlloyType {
        const result: Product[] = [];
        for (const a of this.products) {
            for (const b of that.products) result.push([...a, ...b]);
        }
        return AlloyType.of(result);
    }

    /** { A.B | A in this, B in that, A.arity + B.arity > 2 }; joins of disjoint columns give empty products. */
    join(that: AlloyType): AlloyType {
        const result: Product[] = [];
        for (const a of this.products) {
            for (const b of that.products) {
                if (a.length <= 1 && b.length <= 1) continue;
                const n = a.length + b.length - 2;
                if (a[a.length - 1].intersect(b[0]) === NONE) result.push(emptyProduct(n));
                else result.push([...a.slice(0, -1), ...b.slice(1)]);
            }
        }
        return AlloyType.of(result);
    }

    /** this restricted in its first column to the unary entries of that (that <: this). */
    domainRestrict(that: AlloyType): AlloyType {
        return this.columnRestrict(that, () => 0);
    }

    /** this restricted in its last column to the unary entries of that (this :> that). */
    rangeRestrict(that: AlloyType): AlloyType {
        return this.columnRestrict(that, p => p.length - 1);
    }

    private columnRestrict(that: AlloyType, column: (p: Product) => number): AlloyType {
        const result: Product[] = [];
        for (const b of that.products) {
            if (b.length !== 1) continue;
            for (const a of this.products) {
                if (isEmptyProduct(a)) {
                    result.push(a);
                    continue;
                }
                const i = column(a);
                const c = a[i].intersect(b[0]);
                if (c === NONE) result.push(emptyProduct(a.length));
                else result.push(a.map((s, j) => (j === i ? c : s)));
            }
        }
        return AlloyType.of(result);
    }

    transpose(): AlloyType {
        return AlloyType.of(this.products.filter(p => p.length === 2).map(p => [p[1], p[0]]));
    }

    /** { A in this | A.arity == arity } */
    extract(arity: number): AlloyType {
        return AlloyType.of(this.products.filter(p => p.length === arity));
    }

    /** u + u.u + u.u.u + ... where u are the binary entries of this. */
    closure(): AlloyType {
        const u = this.extract(2);
        let answer = u, power = u;
        for (let i = 0; i < 32; i++) {
            power = power.join(u);
            const next = answer.unionWithCommonArity(power);
            if (next.products.length === answer.products.length && next.products.every((p, j) => p === answer.products[j])) break;
            answer = next;
        }
        return answer;
    }

    /** The relational part only (Alloy's removesBoolAndInt). */
    withoutFlags(): AlloyType {
        return this.isBool || this.isSmallInt ? AlloyType.of(this.products) : this;
    }

    /** Replaces module parameter columns by the unary entries of their instantiation. */
    substitute(params: Map<PrimSig, AlloyType>): AlloyType {
        if (this.isUnknown || params.size === 0) return this;
        const expanded: Product[] = [];
        for (const p of this.products) {
            let result: Product[] = [[]];
            for (const sig of p) {
                const replacement = params.get(sig);
                if (!replacement) {
                    result = result.map(r => [...r, sig]);
                    continue;
                }
                if (replacement.isUnknown) return AlloyType.UNKNOWN;
                const columns = replacement.products.filter(q => q.length === 1).map(q => q[0]);
                result = result.flatMap(r => columns.map(c => [...r, c]));
            }
            expanded.push(...result);
        }
        return AlloyType.of(expanded, this.isBool, this.isSmallInt);
    }

    /** Alloy's notation, e.g. {this/A->this/B, Int}. Signatures of `mainUri` are prefixed with "this/". */
    toString(mainUri?: string): string {
        const parts: string[] = [];
        if (this.isUnknown) return '{?}';
        if (this.isBool) parts.push('PrimitiveBoolean');
        for (const p of this.products) parts.push(p.map(s => sigLabel(s, mainUri)).join('->'));
        return `{${parts.join(', ')}}`;
    }
}

/** Adds a product, keeping the list free of products subsumed by others (as Type.add does). */
function add(entries: Product[], x: Product): void {
    if (x.length === 0) return;
    for (let i = entries.length - 1; i >= 0; i--) {
        const y = entries[i];
        if (y.length !== x.length) continue;
        if (isSubProduct(x, y)) return;
        if (isSubProduct(y, x)) entries.splice(i, 1);
    }
    entries.push(x);
}

/** Label of a signature as Alloy prints it: builtins plain, others qualified by their module. */
export function sigLabel(sig: PrimSig, mainUri?: string): string {
    if (!sig.node) return sig.name;
    const uri = sigDocumentUri(sig);
    if (sig.modulePath && uri !== mainUri) return `${sig.modulePath}/${sig.name}`;
    return `this/${sig.name}`;
}

function sigDocumentUri(sig: PrimSig): string | undefined {
    let node: AstNode | undefined = sig.node;
    while (node?.$container) node = node.$container;
    return (node as { $document?: { uri: { toString(): string } } } | undefined)?.$document?.uri.toString();
}
