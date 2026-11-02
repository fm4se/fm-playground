/**
 * The Alloy visualizer's instance model.
 *
 * TypeScript port of edu.mit.csail.sdg.alloy4viz.{AlloyAtom, AlloyType, AlloySet,
 * AlloyRelation, AlloyTuple, AlloyModel, AlloyInstance}. Equality in Alloy is by
 * value, so every element carries a string `key` that encodes exactly the fields
 * Alloy's equals() compares; maps and sets in this module are keyed by it.
 */

export const INT_MAX = 2147483647;
export const INT_MIN = -2147483648;

/**
 * Sorts names like Alloy's Util.slashComparator: "extends" and "in" first, then
 * names starting with "this/", then by number of slashes, then case-insensitively.
 */
export function slashCompare(a: string, b: string): number {
    if (a === b) return 0;
    if (a === 'extends') return -1;
    if (b === 'extends') return 1;
    if (a === 'in') return -1;
    if (b === 'in') return 1;
    if (a.startsWith('this/')) {
        if (!b.startsWith('this/')) return -1;
    } else if (b.startsWith('this/')) {
        return 1;
    }
    const as = a.split('/').length;
    const bs = b.split('/').length;
    if (as !== bs) return as < bs ? -1 : 1;
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al !== bl) return al < bl ? -1 : 1;
    return a < b ? -1 : 1;
}

// Keys encode exactly what Alloy's equals() compares for each kind of element.
export function typeKey(name: string) {
    return `T:${name}`;
}
export function setKey(name: string, typeName: string) {
    return `S:${name}:${typeName}`;
}
export function relationKey(name: string, typeNames: readonly string[]) {
    return `R:${name}:${typeNames.join('->')}`;
}

export interface ElementFlags {
    isPrivate?: boolean;
    isMeta?: boolean;
    isVar?: boolean;
    isSkolem?: boolean;
}

export interface TypeFlags {
    isOne?: boolean;
    isAbstract?: boolean;
    isBuiltin?: boolean;
    isPrivate?: boolean;
    isMeta?: boolean;
    isEnum?: boolean;
    isVar?: boolean;
}

/** An Alloy signature (toplevel or subsignature). Equal iff same name. */
export class AlloyType {
    readonly kind = 'type' as const;
    readonly key: string;
    readonly isOne: boolean;
    readonly isAbstract: boolean;
    readonly isBuiltin: boolean;
    readonly isPrivate: boolean;
    readonly isMeta: boolean;
    readonly isEnum: boolean;
    readonly isVar: boolean;

    constructor(
        readonly name: string,
        flags: TypeFlags = {}
    ) {
        this.key = typeKey(name);
        this.isOne = !!flags.isOne;
        this.isAbstract = !!flags.isAbstract;
        this.isBuiltin = !!flags.isBuiltin;
        this.isPrivate = !!flags.isPrivate;
        this.isMeta = !!flags.isMeta;
        this.isEnum = !!flags.isEnum;
        this.isVar = !!flags.isVar;
    }

    equals(o: AlloyType | null | undefined): boolean {
        return !!o && o.name === this.name;
    }

    toString(): string {
        return this.name;
    }

    static readonly UNIV = new AlloyType('univ', { isBuiltin: true });
    static readonly INT = new AlloyType('Int', { isBuiltin: true });
    static readonly SEQINT = new AlloyType('seq/Int', { isBuiltin: true });
    static readonly STRING = new AlloyType('String', { isBuiltin: true });
    static readonly SET = new AlloyType('set');
}

/** A unary relation (subset sig, unary skolem, or projected relation). Equal iff same name and type. */
export class AlloySet {
    readonly kind = 'set' as const;
    readonly key: string;
    readonly isPrivate: boolean;
    readonly isMeta: boolean;
    readonly isVar: boolean;
    readonly isSkolem: boolean;

    constructor(
        readonly name: string,
        readonly type: AlloyType,
        flags: ElementFlags = {}
    ) {
        this.key = setKey(name, type.name);
        this.isPrivate = !!flags.isPrivate;
        this.isMeta = !!flags.isMeta;
        this.isVar = !!flags.isVar;
        this.isSkolem = !!flags.isSkolem;
    }

    toString(): string {
        return `${this.name} :  ${this.type.name}`;
    }

    // Metamodel-only sets; kept so default theme settings match Alloy's.
    static readonly VAR = new AlloySet('var', AlloyType.UNIV);
}

/** A relation of arity >= 2. Equal iff same name and same list of types. */
export class AlloyRelation {
    readonly kind = 'rel' as const;
    readonly key: string;
    readonly isPrivate: boolean;
    readonly isMeta: boolean;
    readonly isVar: boolean;
    readonly isSkolem: boolean;

    constructor(
        readonly name: string,
        readonly types: readonly AlloyType[],
        flags: ElementFlags = {}
    ) {
        if (types.length < 2) throw new Error('An AlloyRelation object must have 2 or more types.');
        this.key = relationKey(
            name,
            types.map((t) => t.name)
        );
        this.isPrivate = !!flags.isPrivate;
        this.isMeta = !!flags.isMeta;
        this.isVar = !!flags.isVar;
        this.isSkolem = !!flags.isSkolem;
    }

    get arity(): number {
        return this.types.length;
    }

    /** Returns the remaining types after removing the given columns. */
    project(columns: readonly number[]): AlloyType[] {
        return this.types.filter((_, i) => !columns.includes(i));
    }

    toString(): string {
        return `${this.name} :  ${this.types.map((t) => t.name).join(' -> ')}`;
    }

    // Metamodel-only relations; kept so default theme settings match Alloy's.
    static readonly EXTENDS = new AlloyRelation('extends', [AlloyType.UNIV, AlloyType.UNIV]);
    static readonly MEMBER = new AlloyRelation('member', [AlloyType.UNIV, AlloyType.UNIV]);
    static readonly IN = new AlloyRelation('in', [AlloyType.SET, AlloyType.UNIV]);
    static readonly EQ = new AlloyRelation('=', [AlloyType.SET, AlloyType.UNIV]);
}

export type AlloyNodeElement = AlloyType | AlloySet;
export type AlloyElement = AlloyType | AlloySet | AlloyRelation;

export function compareTypes(a: AlloyType, b: AlloyType): number {
    return slashCompare(a.name, b.name);
}

export function compareSets(a: AlloySet, b: AlloySet): number {
    return slashCompare(a.name, b.name) || compareTypes(a.type, b.type);
}

export function compareRelations(a: AlloyRelation, b: AlloyRelation): number {
    const n = slashCompare(a.name, b.name);
    if (n !== 0) return n;
    if (a.arity !== b.arity) return a.arity < b.arity ? -1 : 1;
    for (let i = 0; i < a.arity; i++) {
        const c = compareTypes(a.types[i], b.types[i]);
        if (c !== 0) return c;
    }
    return 0;
}

const KIND_ORDER = { type: 0, set: 1, rel: 2 } as const;

/** Orders types before sets before relations (AlloyElement.compareTo). */
export function compareElements(a: AlloyElement, b: AlloyElement): number {
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (a.kind === 'type') return compareTypes(a, b as AlloyType);
    if (a.kind === 'set') return compareSets(a, b as AlloySet);
    return compareRelations(a, b as AlloyRelation);
}

/** An atom. `index` is INT_MAX iff it is the only atom of its type (so no number is shown). */
export class AlloyAtom {
    readonly key: string;

    constructor(
        readonly type: AlloyType,
        readonly index: number,
        readonly originalName: string
    ) {
        this.key = `${type.name}\u0000${index}\u0000${originalName}`;
    }

    /** Label without consulting a theme (AlloyAtom.toString in Alloy). */
    toString(): string {
        if (this.type.name === 'Int' || this.type.name === 'seq/Int') return String(this.index);
        if (this.index === INT_MAX) return this.type.name;
        return this.type.name + this.index;
    }
}

export function compareAtoms(a: AlloyAtom, b: AlloyAtom): number {
    const at = a.type.name === 'seq/Int' ? AlloyType.INT : a.type;
    const bt = b.type.name === 'seq/Int' ? AlloyType.INT : b.type;
    if (at.name === 'Int' && bt.name === 'Int') return a.index < b.index ? -1 : a.index > b.index ? 1 : 0;
    const r = compareTypes(at, bt);
    if (r !== 0) return r;
    if (a.index !== b.index) return a.index < b.index ? -1 : 1;
    return a.originalName < b.originalName ? -1 : a.originalName > b.originalName ? 1 : 0;
}

export class AlloyTuple {
    readonly key: string;

    constructor(readonly atoms: readonly AlloyAtom[]) {
        this.key = atoms.map((a) => a.key).join('\u0001');
    }

    get arity(): number {
        return this.atoms.length;
    }

    get start(): AlloyAtom {
        return this.atoms[0];
    }

    get end(): AlloyAtom {
        return this.atoms[this.atoms.length - 1];
    }

    reverse(): AlloyTuple {
        return new AlloyTuple([...this.atoms].reverse());
    }

    project(columns: readonly number[]): AlloyAtom[] {
        return this.atoms.filter((_, i) => !columns.includes(i));
    }

    toString(): string {
        return `<${this.atoms.map((a) => a.toString()).join(', ')}>`;
    }
}

export function compareTuples(a: AlloyTuple, b: AlloyTuple): number {
    if (a.arity !== b.arity) return a.arity < b.arity ? -1 : 1;
    for (let i = 0; i < a.arity; i++) {
        const r = compareAtoms(a.atoms[i], b.atoms[i]);
        if (r !== 0) return r;
    }
    return 0;
}

function uniqueSorted<T extends { key: string }>(items: Iterable<T>, cmp: (a: T, b: T) => number): T[] {
    const map = new Map<string, T>();
    for (const x of items) if (!map.has(x.key)) map.set(x.key, x);
    return [...map.values()].sort(cmp);
}

/** Types, sets and relations of an instance plus the sig hierarchy. Immutable. */
export class AlloyModel {
    readonly types: readonly AlloyType[];
    readonly sets: readonly AlloySet[];
    readonly relations: readonly AlloyRelation[];
    /** Keys of elements that are nonempty in at least one state of the trace. */
    readonly nonempty: ReadonlySet<string>;
    /** Type name -> supertype (univ is never a key). */
    private readonly hierarchy: Map<string, AlloyType>;
    private readonly typeByName: Map<string, AlloyType>;
    private readonly setKeys: Set<string>;
    private readonly relationByKey: Map<string, AlloyRelation>;

    /**
     * @param parents maps a type name to its supertype; types missing from the
     *        model (or cycles) fall back to univ.
     */
    constructor(
        types: Iterable<AlloyType>,
        sets: Iterable<AlloySet>,
        relations: Iterable<AlloyRelation>,
        nonempty: ReadonlySet<string>,
        parents: ReadonlyMap<string, AlloyType>
    ) {
        const allTypes = uniqueSorted([...types, AlloyType.UNIV], compareTypes);
        const typeNames = new Set(allTypes.map((t) => t.name));
        this.types = allTypes;
        this.sets = uniqueSorted(
            [...sets].filter((s) => typeNames.has(s.type.name)),
            compareSets
        );
        this.relations = uniqueSorted(
            [...relations].filter((r) => r.types.every((t) => typeNames.has(t.name))),
            compareRelations
        );
        this.nonempty = nonempty;
        this.hierarchy = new Map();
        for (const t of allTypes) {
            if (t.name === 'univ') continue;
            let sup = isCycle(parents, t) ? undefined : parents.get(t.name);
            if (!sup || !typeNames.has(sup.name)) sup = AlloyType.UNIV;
            this.hierarchy.set(t.name, sup);
        }
        this.typeByName = new Map(allTypes.map((t) => [t.name, t]));
        this.setKeys = new Set(this.sets.map((s) => s.key));
        this.relationByKey = new Map(this.relations.map((r) => [r.key, r]));
    }

    /** Builds a model reusing the hierarchy and nonempty info of `old`. */
    static derive(
        types: Iterable<AlloyType>,
        sets: Iterable<AlloySet>,
        relations: Iterable<AlloyRelation>,
        old: AlloyModel
    ): AlloyModel {
        return new AlloyModel(types, sets, relations, old.nonempty, old.hierarchy);
    }

    /** Returns null for univ, otherwise the supertype (univ if the type is unknown). */
    getSuperType(type: AlloyType): AlloyType | null {
        if (type.name === 'univ') return null;
        return this.hierarchy.get(type.name) ?? AlloyType.UNIV;
    }

    /** Returns the topmost non-univ supertype (the type itself if its parent is univ). */
    getTopmostSuperType(type: AlloyType | null): AlloyType | null {
        if (!type || type.name === 'univ') return null;
        for (;;) {
            const top = this.getSuperType(type);
            if (!top || top.name === 'univ') return type;
            type = top;
        }
    }

    getSubTypes(type: AlloyType): AlloyType[] {
        return this.types.filter((t) => this.isSubtype(t, type));
    }

    getDirectSubTypes(type: AlloyType): AlloyType[] {
        return this.types.filter((t) => this.isDirectSubtype(t, type));
    }

    isSubtype(sub: AlloyType | null, sup: AlloyType | null): boolean {
        if (!sub || !sup || !this.typeByName.has(sub.name) || sub.name === 'univ') return false;
        let t: AlloyType | null = sub;
        while (t) {
            t = this.getSuperType(t);
            if (t && t.name === sup.name) return true;
        }
        return false;
    }

    isDirectSubtype(sub: AlloyType | null, sup: AlloyType | null): boolean {
        if (!sub || !sup || !this.typeByName.has(sub.name) || sub.name === 'univ') return false;
        return this.hierarchy.get(sub.name)?.name === sup.name;
    }

    isEqualOrSubtype(sub: AlloyType | null, sup: AlloyType | null): boolean {
        if (!sup) return false;
        let t: AlloyType | null = sub;
        while (t) {
            if (t.name === sup.name) return true;
            t = this.getSuperType(t);
        }
        return false;
    }

    hasType(type: AlloyType): boolean {
        return this.typeByName.has(type.name);
    }

    findType(name: string): AlloyType | undefined {
        return this.typeByName.get(name);
    }

    hasSet(set: AlloySet): boolean {
        return this.setKeys.has(set.key);
    }

    findSet(name: string, type: AlloyType): AlloySet | undefined {
        return this.sets.find((s) => s.name === name && s.type.name === type.name);
    }

    hasRelation(rel: AlloyRelation): boolean {
        return this.relationByKey.has(rel.key);
    }

    findRelation(name: string, types: readonly AlloyType[]): AlloyRelation | undefined {
        return this.relationByKey.get(
            relationKey(
                name,
                types.map((t) => t.name)
            )
        );
    }
}

function isCycle(map: ReadonlyMap<string, AlloyType>, x: AlloyType): boolean {
    let i = -5;
    const n = map.size;
    let t: AlloyType | undefined = x;
    while (t) {
        t = map.get(t.name);
        i++;
        if (i >= n) return true;
    }
    return false;
}

/** An instance (one state of a trace) as consumed by the visualizer. Immutable. */
export class AlloyInstance {
    /** All atoms, sorted. */
    readonly atoms: readonly AlloyAtom[];
    private readonly atomSets: Map<string, AlloySet[]>;
    private readonly typeAtoms: Map<string, AlloyAtom[]>;
    private readonly setAtoms: Map<string, AlloyAtom[]>;
    private readonly relTuples: Map<string, AlloyTuple[]>;

    /**
     * Elements not in `model` (or atoms/tuples not matching it) are silently dropped,
     * exactly like Alloy's AlloyInstance constructor.
     */
    constructor(
        readonly model: AlloyModel,
        atom2sets: Iterable<[AlloyAtom, Iterable<AlloySet>]>,
        rel2tuples: Iterable<[AlloyRelation, Iterable<AlloyTuple>]>,
        readonly traceLength: number,
        readonly loopLength: number,
        readonly isMetamodel = false
    ) {
        const atomEntries = new Map<string, { atom: AlloyAtom; sets: AlloySet[] }>();
        for (const [atom, sets] of atom2sets) {
            if (!model.hasType(atom.type)) continue;
            const prev = atomEntries.get(atom.key);
            const list = prev ? prev.sets : [];
            for (const s of sets)
                if (model.hasSet(s) && model.isEqualOrSubtype(atom.type, s.type) && !list.some((x) => x.key === s.key))
                    list.push(s);
            atomEntries.set(atom.key, { atom, sets: list });
        }
        this.atoms = [...atomEntries.values()].map((e) => e.atom).sort(compareAtoms);
        this.atomSets = new Map();
        for (const e of atomEntries.values()) this.atomSets.set(e.atom.key, e.sets.sort(compareSets));

        this.setAtoms = new Map();
        this.typeAtoms = new Map();
        for (const atom of this.atoms) {
            for (const s of this.atomSets.get(atom.key)!) push(this.setAtoms, s.key, atom);
            for (let t: AlloyType | null = atom.type; t; t = model.getSuperType(t)) push(this.typeAtoms, t.name, atom);
        }

        this.relTuples = new Map();
        for (const [rel, tuples] of rel2tuples) {
            if (!model.hasRelation(rel)) continue;
            const kept = new Map<string, AlloyTuple>(this.relTuples.get(rel.key)?.map((t) => [t.key, t]) ?? []);
            for (const tuple of tuples) {
                if (tuple.arity !== rel.arity) continue;
                const ok = tuple.atoms.every(
                    (a, i) => this.atomSets.has(a.key) && model.isEqualOrSubtype(a.type, rel.types[i])
                );
                if (ok) kept.set(tuple.key, tuple);
            }
            if (kept.size > 0) this.relTuples.set(rel.key, [...kept.values()].sort(compareTuples));
        }
    }

    hasAtom(atom: AlloyAtom): boolean {
        return this.atomSets.has(atom.key);
    }

    /** Sorted sets that this atom is in. */
    atom2sets(atom: AlloyAtom): readonly AlloySet[] {
        return this.atomSets.get(atom.key) ?? [];
    }

    /** Sorted atoms of the type, including atoms of its subtypes. */
    type2atoms(type: AlloyType): readonly AlloyAtom[] {
        return this.typeAtoms.get(type.name) ?? [];
    }

    set2atoms(set: AlloySet): readonly AlloyAtom[] {
        return this.setAtoms.get(set.key) ?? [];
    }

    relation2tuples(rel: AlloyRelation): readonly AlloyTuple[] {
        return this.relTuples.get(rel.key) ?? [];
    }
}

function push<V>(map: Map<string, V[]>, key: string, v: V) {
    const list = map.get(key);
    if (list) list.push(v);
    else map.set(key, [v]);
}
