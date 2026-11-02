/**
 * Builds visualizer instances from the Alloy API response.
 *
 * The API returns Alloy's solution XML converted to JSON by org.json (attributes
 * become keys, single children are objects rather than arrays, numeric labels
 * become numbers). This is a port of edu.mit.csail.sdg.alloy4viz.StaticInstanceReader
 * working on that JSON instead of on an A4Solution.
 */
import {
    AlloyAtom,
    AlloyInstance,
    AlloyModel,
    AlloyRelation,
    AlloySet,
    AlloyTuple,
    AlloyType,
    INT_MAX,
    ElementFlags,
} from './model';

/** Trace-level information shared by all states. */
export interface AlloyTrace {
    /** One instance per state; a static (non-temporal) solution has exactly one. */
    states: AlloyInstance[];
    isTemporal: boolean;
    traceLength: number;
    /** Index of the state the last state loops back to. */
    loopState: number;
    command: string;
    bitwidth: number;
    maxSeq: number;
}

type Json = Record<string, any>;

const asArray = <T = Json>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const yes = (x: unknown) => x === 'yes' || x === true;
const str = (x: unknown) => String(x);

export interface XmlSig {
    id: string;
    label: string;
    parentId?: string;
    /** Parents of a subset sig. */
    parentIds: string[];
    atoms: string[];
    builtin: boolean;
    isAbstract: boolean;
    isOne: boolean;
    isPrivate: boolean;
    isMeta: boolean;
    isEnum: boolean;
    isVar: boolean;
    isPrim: boolean;
}

export interface XmlRel {
    label: string;
    /** Each entry is one product type (a fold of the expression's type) as sig ids. */
    folds: string[][];
    tuples: string[][];
    flags: ElementFlags;
}

/** One state of the solution XML, normalized. */
export interface XmlState {
    sigs: XmlSig[];
    fields: XmlRel[];
    skolems: XmlRel[];
    bitwidth: number;
    maxSeq: number;
}

/** The normalized XML of every state of the response. */
export function readXmlStates(response: Json): XmlState[] {
    return asArray(response?.alloy?.instance).map(readState);
}

/** The integer atoms of a solution with the given bitwidth, as labels. */
export function intAtomLabels(bitwidth: number): string[] {
    const labels: string[] = [];
    for (let i = minInt(bitwidth), max = maxInt(bitwidth); i <= max; i++) labels.push(String(i));
    return labels;
}

function atomLabels(x: Json | undefined): string[] {
    return asArray(x?.atom).map((a: Json) => str(a.label));
}

function readRel(x: Json, isSkolem: boolean): XmlRel {
    return {
        label: str(x.label),
        folds: asArray(x.types).map((t: Json) => asArray(t.type).map((ty: Json) => str(ty.ID))),
        tuples: asArray(x.tuple).map((t: Json) => atomLabels(t)),
        flags: { isPrivate: yes(x.private), isMeta: yes(x.meta), isVar: yes(x.var), isSkolem },
    };
}

function readState(inst: Json): XmlState {
    const sigs = asArray(inst.sig).map((s: Json): XmlSig => {
        const label = str(s.label);
        return {
            id: str(s.ID),
            label,
            parentId: s.parentID != null ? str(s.parentID) : undefined,
            parentIds: asArray(s.type).map((t: Json) => str(t.ID)),
            atoms: atomLabels(s),
            builtin: yes(s.builtin),
            isAbstract: yes(s.abstract),
            isOne: yes(s.one),
            isPrivate: yes(s.private),
            isMeta: yes(s.meta),
            isEnum: yes(s.enum),
            isVar: yes(s.var),
            isPrim: s.parentID != null || label === 'univ',
        };
    });
    return {
        sigs,
        fields: asArray(inst.field).map((f: Json) => readRel(f, false)),
        skolems: asArray(inst.skolem).map((f: Json) => readRel(f, true)),
        bitwidth: Number(inst.bitwidth ?? 0),
        maxSeq: Number(inst.maxseq ?? 0),
    };
}

/** Removes "this/" (Util.tailThis). */
const tailThis = (s: string) => s.replace(/this\//g, '');

/** Keeps the part after the last "/", preserving a leading "$" (Util.tail). */
function tail(s: string): string {
    const i = s.lastIndexOf('/');
    const label = i < 0 ? s : s.substring(i + 1);
    return s.charAt(0) === '$' && label.charAt(0) !== '$' ? '$' + label : label;
}

const RESERVED = new Set(['univ', 'Int', 'seq/Int', 'String']);

function maxInt(bitwidth: number) {
    return bitwidth < 1 ? -1 : 2 ** (bitwidth - 1) - 1;
}

function minInt(bitwidth: number) {
    return bitwidth < 1 ? 0 : -(2 ** (bitwidth - 1));
}

/** Parsed contents of one state, before the trace-wide nonempty information is known. */
interface RawState {
    types: AlloyType[];
    parents: Map<string, AlloyType>;
    sets: AlloySet[];
    atom2sets: Map<string, { atom: AlloyAtom; sets: AlloySet[] }>;
    rel2tuples: Map<string, { rel: AlloyRelation; tuples: AlloyTuple[] }>;
    nonempty: Set<string>;
}

function buildState(xml: XmlState): RawState {
    const sigById = new Map(xml.sigs.map((s) => [s.id, s]));
    const sig2type = new Map<string, AlloyType>();
    const parents = new Map<string, AlloyType>();
    const usedTypeNames = new Set<string>(['univ', 'Int', 'seq/Int', 'String']);
    const sets: AlloySet[] = [];
    const setKeys = new Set<string>();
    const rel2tuples = new Map<string, { rel: AlloyRelation; tuples: AlloyTuple[] }>();
    const atom2sets = new Map<string, { atom: AlloyAtom; sets: AlloySet[] }>();
    const string2atom = new Map<string, AlloyAtom>();
    /** Atom label -> id of its most specific prim sig. */
    const atomSig = new Map<string, string>();
    const nonempty = new Set<string>();

    const builtinType = (s: XmlSig): AlloyType | undefined => {
        if (s.label === 'univ') return AlloyType.UNIV;
        if (s.label === 'Int') return AlloyType.INT;
        if (s.label === 'seq/Int') return AlloyType.SEQINT;
        if (s.label === 'String') return AlloyType.STRING;
        return undefined;
    };

    const isUniv = (id: string | undefined) => id != null && sigById.get(id)?.label === 'univ';

    const sigType = (id: string): AlloyType => {
        const known = sig2type.get(id);
        if (known) return known;
        const s = sigById.get(id);
        if (!s) throw new Error(`Unknown sig id ${id}`);
        const builtin = builtinType(s);
        if (builtin) {
            sig2type.set(id, builtin);
            return builtin;
        }
        let name = tailThis(s.label);
        while (usedTypeNames.has(name)) name += "'";
        usedTypeNames.add(name);
        const type = new AlloyType(name, {
            isOne: s.isOne,
            isAbstract: s.isAbstract,
            isPrivate: s.isPrivate,
            isMeta: s.isMeta,
            isEnum: s.isEnum,
            isVar: s.isVar,
        });
        sig2type.set(id, type);
        if (s.parentId != null && !isUniv(s.parentId)) parents.set(type.name, sigType(s.parentId));
        return type;
    };

    // Built-in types and their hierarchy.
    for (const s of xml.sigs) if (builtinType(s)) sigType(s.id);
    parents.set(AlloyType.SEQINT.name, AlloyType.INT);

    const intSig = xml.sigs.find((s) => s.label === 'Int');
    const seqSig = xml.sigs.find((s) => s.label === 'seq/Int');
    for (let i = minInt(xml.bitwidth), max = maxInt(xml.bitwidth); i <= max; i++) {
        const isSeq = i >= 0 && i < xml.maxSeq;
        const atom = new AlloyAtom(isSeq ? AlloyType.SEQINT : AlloyType.INT, i, String(i));
        atom2sets.set(atom.key, { atom, sets: [] });
        string2atom.set(String(i), atom);
        const sigId = isSeq ? (seqSig?.id ?? intSig?.id) : intSig?.id;
        if (sigId) atomSig.set(String(i), sigId);
    }

    for (const s of xml.sigs) if (s.isPrim && !s.builtin) sigType(s.id);

    // Atoms, each associated with its most specific sig.
    const children = new Map<string, XmlSig[]>();
    for (const s of xml.sigs) if (s.isPrim && s.parentId != null) push(children, s.parentId, s);
    const addAtoms = (s: XmlSig) => {
        for (const c of children.get(s.id) ?? []) addAtoms(c);
        const type = sigType(s.id);
        for (const label of s.atoms) {
            const dollar = label.lastIndexOf('$');
            const num = dollar >= 0 ? label.substring(dollar + 1) : label;
            let index = /^[+-]?\d+$/.test(num) ? parseInt(num, 10) : INT_MAX;
            if (!Number.isFinite(index) || Math.abs(index) > INT_MAX) index = INT_MAX;
            // A lone atom gets no number, except in variable sigs where its id may change between states.
            const atom = new AlloyAtom(type, s.atoms.length === 1 && !s.isVar ? INT_MAX : index, label);
            atom2sets.set(atom.key, { atom, sets: [] });
            string2atom.set(label, atom);
            atomSig.set(label, s.id);
        }
        if (s.atoms.length > 0) nonempty.add(type.key);
    };
    for (const s of xml.sigs) if (s.isPrim && isUniv(s.parentId) && (!s.builtin || s.label === 'String')) addAtoms(s);

    /** True iff the atom belongs to the prim sig `sigId` or one of its subsigs. */
    const atomIn = (label: string, sigId: string): boolean => {
        if (isUniv(sigId)) return string2atom.has(label);
        for (let id = atomSig.get(label); id != null; id = sigById.get(id)?.parentId) if (id === sigId) return true;
        return false;
    };

    const makeSet = (label: string, type: AlloyType, flags: ElementFlags): AlloySet => {
        let name = tail(label);
        while (RESERVED.has(name)) name += "'";
        for (;;) {
            const set = new AlloySet(name, type, flags);
            if (!setKeys.has(set.key)) return set;
            name += "'";
        }
    };

    const makeRel = (label: string, types: AlloyType[], flags: ElementFlags): AlloyRelation => {
        let name = tail(label);
        while (RESERVED.has(name)) name += "'";
        for (;;) {
            const rel = new AlloyRelation(name, types, flags);
            if (!rel2tuples.has(rel.key)) return rel;
            name += "'";
        }
    };

    const setOrRel = (label: string, folds: string[][], tuples: string[][], flags: ElementFlags) => {
        for (const ps of folds) {
            if (ps.length === 1) {
                const set = makeSet(label, sigType(ps[0]), flags);
                sets.push(set);
                setKeys.add(set.key);
                for (const tuple of tuples) {
                    if (tuple.length !== 1 || !atomIn(tuple[0], ps[0])) continue;
                    atom2sets.get(string2atom.get(tuple[0])!.key)!.sets.push(set);
                    nonempty.add(set.key);
                }
            } else {
                const rel = makeRel(
                    label,
                    ps.map((id) => sigType(id)),
                    flags
                );
                const kept: AlloyTuple[] = [];
                for (const tuple of tuples) {
                    if (tuple.length !== ps.length || !tuple.every((a, i) => atomIn(a, ps[i]))) continue;
                    kept.push(new AlloyTuple(tuple.map((a) => string2atom.get(a)!)));
                }
                rel2tuples.set(rel.key, { rel, tuples: kept });
                if (kept.length > 0) nonempty.add(rel.key);
            }
        }
    };

    // Subset sigs become sets, one per prim type in their (folded) type.
    const subsetFold = (s: XmlSig, seen = new Set<string>()): string[] => {
        if (seen.has(s.id)) return [];
        seen.add(s.id);
        const prims = new Set<string>();
        for (const pid of s.parentIds) {
            const p = sigById.get(pid);
            if (!p) continue;
            if (p.isPrim) prims.add(p.id);
            else subsetFold(p, seen).forEach((id) => prims.add(id));
        }
        // A type subsumed by one of its ancestors in the same union is dropped.
        const subsumed = (id: string) => {
            for (let p = sigById.get(id)?.parentId; p != null; p = sigById.get(p)?.parentId)
                if (prims.has(p)) return true;
            return false;
        };
        return [...prims].filter((id) => !subsumed(id));
    };
    for (const s of xml.sigs)
        if (!s.isPrim)
            setOrRel(
                s.label,
                subsetFold(s).map((id) => [id]),
                s.atoms.map((a) => [a]),
                { isPrivate: s.isPrivate, isMeta: s.isMeta, isVar: s.isVar }
            );
    for (const f of xml.fields) setOrRel(f.label, f.folds, f.tuples, f.flags);
    for (const k of xml.skolems) setOrRel(k.label, k.folds, k.tuples, k.flags);

    return {
        types: [...sig2type.values()],
        parents,
        sets,
        atom2sets,
        rel2tuples,
        nonempty,
    };
}

function push<V>(map: Map<string, V[]>, key: string, v: V) {
    const list = map.get(key);
    if (list) list.push(v);
    else map.set(key, [v]);
}

/** True iff the API response contains a (satisfiable) Alloy solution. */
export function hasAlloySolution(response: unknown): boolean {
    return !!response && typeof response === 'object' && 'alloy' in response && !!(response as Json).alloy?.instance;
}

/** Parses an Alloy API instance response into a trace of visualizer instances. */
export function readAlloyTrace(response: Json): AlloyTrace {
    const xmlInstances = asArray(response?.alloy?.instance);
    if (xmlInstances.length === 0) throw new Error('The response does not contain an Alloy instance.');
    const first = xmlInstances[0];
    const traceLength = Math.max(1, Number(first.tracelength ?? 1));
    const loopLength = Number(first.looplength ?? 1);
    const isTemporal = Number(first.maxtrace ?? -1) >= 0;

    const raw = xmlInstances.map((x) => buildState(readState(x)));
    const nonempty = new Set<string>();
    for (const r of raw.slice(0, traceLength)) r.nonempty.forEach((k) => nonempty.add(k));

    const states = raw.map((r) => {
        const model = new AlloyModel(
            r.types,
            r.sets,
            [...r.rel2tuples.values()].map((x) => x.rel),
            nonempty,
            r.parents
        );
        return new AlloyInstance(
            model,
            [...r.atom2sets.values()].map((x): [AlloyAtom, AlloySet[]] => [x.atom, x.sets]),
            [...r.rel2tuples.values()].map((x): [AlloyRelation, AlloyTuple[]] => [x.rel, x.tuples]),
            traceLength,
            loopLength
        );
    });

    return {
        states,
        isTemporal,
        traceLength,
        loopState: traceLength - loopLength,
        command: str(first.command ?? ''),
        bitwidth: Number(first.bitwidth ?? 0),
        maxSeq: Number(first.maxseq ?? 0),
    };
}

/**
 * Maps a position on the (infinite, lasso-shaped) trace to a state index:
 * positions past the end wrap around to the loop state.
 */
export function normalizeState(position: number, traceLength: number, loopState: number): number {
    if (position < traceLength) return position;
    const loop = traceLength - loopState;
    return loopState + ((position - traceLength) % loop);
}
