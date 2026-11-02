/**
 * The instance as a browsable tree: sigs -> atoms -> fields -> values.
 * Port of edu.mit.csail.sdg.alloy4viz.VizTree. Children are computed lazily
 * because the tree is infinite (an atom's field leads to atoms with fields...).
 */
import { slashCompare } from './model';
import { XmlState, intAtomLabels } from './reader';

export interface TreeItem {
    id: string;
    kind: 'sig' | 'set' | 'atom' | 'field' | 'tuple';
    label: string;
    children(): TreeItem[];
}

const ci = (a: string, b: string) => {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
};

export function instanceTree(state: XmlState): TreeItem[] {
    const sigById = new Map(state.sigs.map((s) => [s.id, s]));
    const kids = new Map<string, string[]>();
    for (const s of state.sigs) if (s.parentId != null) kids.set(s.parentId, [...(kids.get(s.parentId) ?? []), s.id]);

    /** All atoms of a sig, including those of its subsigs. */
    const sigAtoms = (id: string): string[] => {
        const s = sigById.get(id)!;
        if (s.label === 'Int') return intAtomLabels(state.bitwidth);
        return [...s.atoms, ...(kids.get(id) ?? []).flatMap(sigAtoms)];
    };

    // Relations with arity > 1 that can be shown under an atom.
    const relations = [...state.fields, ...state.skolems.filter((k) => k.tuples.some((t) => t.length > 1))];

    const atomItem = (atom: string, path: string): TreeItem => ({
        id: `${path}/${atom}`,
        kind: 'atom',
        label: atom,
        children: () =>
            relations
                .filter((r) => r.tuples.some((t) => t.length > 1 && t[0] === atom))
                .sort((a, b) => ci(a.label, b.label))
                .map((r, i) => fieldItem(atom, r.label, r.tuples, `${path}/${atom}#${i}`)),
    });

    const fieldItem = (atom: string, label: string, tuples: string[][], path: string): TreeItem => ({
        id: path,
        kind: 'field',
        label: `field ${label}`,
        children: () => {
            const rows = tuples.filter((t) => t.length > 1 && t[0] === atom);
            return rows
                .map((t) =>
                    t.length === 2
                        ? atomItem(t[1], path)
                        : {
                              id: `${path}/${t.join(',')}`,
                              kind: 'tuple' as const,
                              label: t.slice(1).join(' -> '),
                              children: () =>
                                  [...new Set(t.slice(1))].map((a) => atomItem(a, `${path}/${t.join(',')}`)),
                          }
                )
                .sort((a, b) => ci(a.label, b.label));
        },
    });

    const roots: TreeItem[] = state.sigs
        .filter((s) => s.label !== 'univ' && s.label !== 'seq/Int' && s.label !== 'none')
        .sort((a, b) => slashCompare(a.label, b.label))
        .map((s) => ({
            id: `sig:${s.id}`,
            kind: 'sig' as const,
            label: `sig ${s.label.replace(/this\//g, '')}`,
            children: () =>
                [...new Set(s.isPrim ? sigAtoms(s.id) : s.atoms)].sort(ci).map((a) => atomItem(a, `sig:${s.id}`)),
        }));
    const skolemSets = state.skolems
        .filter((k) => k.label.startsWith('$') && k.folds.every((f) => f.length === 1))
        .sort((a, b) => slashCompare(a.label, b.label))
        .map((k, i) => ({
            id: `skolem:${i}`,
            kind: 'set' as const,
            label: `set ${k.label}`,
            children: () => [...new Set(k.tuples.map((t) => t[0]))].sort(ci).map((a) => atomItem(a, `skolem:${i}`)),
        }));
    return [...roots, ...skolemSets];
}
