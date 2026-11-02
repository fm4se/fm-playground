/**
 * Projection of models and instances over signatures.
 * Port of edu.mit.csail.sdg.alloy4viz.{AlloyProjection, StaticProjector}.
 */
import { AlloyAtom, AlloyInstance, AlloyModel, AlloyRelation, AlloySet, AlloyTuple, AlloyType } from './model';

/** The projected types (by name) and the atom chosen for each of them. */
export type AlloyProjection = ReadonlyMap<string, AlloyAtom | null>;

export const NO_PROJECTION: AlloyProjection = new Map();

/**
 * Projects a model over the given types. If `columns` is given, it receives for
 * each surviving relation the indices of the columns removed by the projection.
 */
export function projectModel(
    model: AlloyModel,
    projected: Iterable<AlloyType>,
    columns?: Map<string, number[]>
): AlloyModel {
    const typeNames = new Set(model.types.map((t) => t.name));
    for (const type of projected) {
        typeNames.delete(type.name);
        for (const sub of model.getSubTypes(type)) typeNames.delete(sub.name);
    }
    typeNames.add('univ');
    const types = model.types.filter((t) => typeNames.has(t.name));
    const sets: AlloySet[] = [...model.sets];
    const relations: AlloyRelation[] = [];
    for (const rel of model.relations) {
        const removed: number[] = [];
        const kept = rel.types.filter((t, i) => {
            if (typeNames.has(t.name)) return true;
            removed.push(i);
            return false;
        });
        if (kept.length > 1) relations.push(new AlloyRelation(rel.name, kept, rel));
        else if (kept.length === 1) sets.push(new AlloySet(rel.name, kept[0], rel));
        if (kept.length > 0) columns?.set(rel.key, removed);
    }
    return AlloyModel.derive(
        types,
        sets.filter((s) => typeNames.has(s.type.name)),
        relations,
        model
    );
}

/**
 * Projects an instance: tuples whose projected columns do not hold the chosen
 * atom are dropped, the other tuples lose those columns.
 */
export function projectInstance(instance: AlloyInstance, projection: AlloyProjection): AlloyInstance {
    const old = instance.model;
    const projectedTypes = [...projection.keys()].map((n) => old.findType(n)).filter((t): t is AlloyType => !!t);
    const columns = new Map<string, number[]>();
    const model = projectModel(old, projectedTypes, columns);

    const atom2sets = new Map<string, { atom: AlloyAtom; sets: AlloySet[] }>();
    for (const atom of instance.atoms) atom2sets.set(atom.key, { atom, sets: [...instance.atom2sets(atom)] });

    const rel2tuples = new Map<string, { rel: AlloyRelation; tuples: AlloyTuple[] }>();
    for (const r of old.relations) {
        const list = columns.get(r.key);
        if (!list) continue;
        outer: for (const tuple of instance.relation2tuples(r)) {
            for (const i of list) {
                const top = old.getTopmostSuperType(r.types[i]);
                const chosen = top ? projection.get(top.name) : undefined;
                if (!chosen || chosen.key !== tuple.atoms[i].key) continue outer;
            }
            const atoms = tuple.project(list);
            const types = r.project(list);
            if (types.length > 1 && atoms.length > 1) {
                const r2 = new AlloyRelation(r.name, types, r);
                const entry = rel2tuples.get(r2.key) ?? { rel: r2, tuples: [] };
                entry.tuples.push(new AlloyTuple(atoms));
                rel2tuples.set(r2.key, entry);
            } else if (types.length === 1 && atoms.length === 1) {
                const a = atoms[0];
                const entry = atom2sets.get(a.key) ?? { atom: a, sets: [] };
                entry.sets.push(new AlloySet(r.name, types[0], r));
                atom2sets.set(a.key, entry);
            }
        }
    }
    return new AlloyInstance(
        model,
        [...atom2sets.values()].map((e): [AlloyAtom, AlloySet[]] => [e.atom, e.sets]),
        [...rel2tuples.values()].map((e): [AlloyRelation, AlloyTuple[]] => [e.rel, e.tuples]),
        -1,
        -1,
        instance.isMetamodel
    );
}
