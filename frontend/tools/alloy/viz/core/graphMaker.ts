/**
 * Turns an instance into a laid-out graph according to a theme.
 * Port of edu.mit.csail.sdg.alloy4viz.StaticGraphMaker.
 */
import { AlloyAtom, AlloyInstance, AlloyModel, AlloyRelation, AlloyTuple, AlloyType, compareRelations } from './model';
import { AlloyProjection, NO_PROJECTION, projectInstance } from './projection';
import { VizTheme } from './theme';
import { MAGIC_PALETTES, dotColorToCss } from './dot';
import { Graph, GraphEdge, GraphNode } from './graph/graph';
import { TextMetrics } from './graph/textMetrics';

/** What a node stands for; the renderer uses it for tooltips and menus. */
export interface AtomNodeData {
    atom: AlloyAtom;
}

/** What an edge stands for. */
export interface TupleEdgeData {
    tuple: AlloyTuple;
    relation: AlloyRelation;
}

export interface MakeGraphOptions {
    metrics: TextMetrics;
    projection?: AlloyProjection;
}

/** Builds and lays out the graph of one instance (StaticGraphMaker.produceGraph). */
export function makeGraph(original: AlloyInstance, baseTheme: VizTheme, options: MakeGraphOptions): Graph {
    const instance = projectInstance(original, options.projection ?? NO_PROJECTION);
    const model = instance.model;
    const theme = baseTheme.withDefaultVarStyles(model);
    const graph = new Graph(options.metrics, theme.fontSize / 12);
    new GraphBuilder(graph, instance, model, theme).build();
    const nonIntTypes = new Set(
        instance.atoms.filter((a) => a.type.name !== 'Int' && a.type.name !== 'seq/Int').map((a) => a.type.name)
    );
    if (nonIntTypes.size === 0) new GraphNode(graph, '', 'No atoms found');
    else if (graph.nodes.length === 0) {
        new GraphNode(
            graph,
            '',
            ...wrap(
                'No visible atoms found, this can be caused by your theme settings. ' +
                    'Theme settings might hide the following sigs that were found in the instance: ' +
                    [...nonIntTypes].join(', '),
                40
            )
        );
    }
    graph.layout();
    return graph;
}

function wrap(text: string, width: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        if (line && line.length + 1 + word.length > width) {
            lines.push(line);
            line = word;
        } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines;
}

class GraphBuilder {
    private readonly atom2node = new Map<string, GraphNode>();
    /** Extra label lines per node, kept sorted like Alloy's TreeSet. */
    private readonly attribs = new Map<GraphNode, Set<string>>();

    constructor(
        private readonly graph: Graph,
        private readonly instance: AlloyInstance,
        private readonly model: AlloyModel,
        private readonly theme: VizTheme
    ) {}

    build() {
        const { theme, model, instance } = this;
        const hidePrivate = theme.hidePrivate;
        const hideSkolem = theme.hideSkolem;
        const magicColor = new Map<string, string>();
        const relations = [...model.relations].sort(compareRelations);
        const counts = new Map<string, number>();

        // Relations: edges, and a magic color for each relation that will show up.
        let colors = MAGIC_PALETTES[theme.edgePalette];
        let ci = 0;
        for (const rel of relations) {
            const c = theme.resolve('edgeColor', rel, model);
            const cc = c === 'Magic' ? colors[ci] : dotColorToCss(c, theme.edgePalette);
            const shown =
                !(hidePrivate && rel.isPrivate) &&
                !(hideSkolem && rel.isSkolem) &&
                theme.resolve('edgeVisible', rel, model);
            counts.set(rel.key, shown ? this.edgesAsArcs(rel, colors[ci]) : 0);
            magicColor.set(rel.key, cc);
            if (shown && model.nonempty.has(rel.key)) ci = (ci + 1) % colors.length;
        }

        // Types: a magic color for each type that will show up.
        colors = MAGIC_PALETTES[theme.nodePalette];
        ci = 0;
        for (const type of model.types) {
            const c = theme.resolve('nodeColor', type, model);
            // Alloy resolves non-magic node colors with the edge palette here; nodes recompute their own color later.
            magicColor.set(type.key, c === 'Magic' ? colors[ci] : dotColorToCss(c, theme.edgePalette));
            if (
                !(hidePrivate && type.isPrivate) &&
                theme.resolve('nodeVisible', type, model) &&
                model.nonempty.has(type.key)
            )
                ci = (ci + 1) % colors.length;
        }

        // Atoms not yet drawn as edge endpoints, unless hidden when unconnected.
        for (const atom of instance.atoms) {
            let any = false;
            for (const s of instance.atom2sets(atom)) {
                if (hideSkolem && s.isSkolem) continue;
                any = true;
                if (theme.resolve('nodeVisible', s, model) && !theme.resolve('hideUnconnected', s, model)) {
                    this.createNode(atom, magicColor.get(atom.type.key));
                    break;
                }
            }
            if (
                !any &&
                theme.resolve('nodeVisible', atom.type, model) &&
                !theme.resolve('hideUnconnected', atom.type, model)
            )
                this.createNode(atom, magicColor.get(atom.type.key));
        }

        for (const rel of relations)
            if (
                !(hidePrivate && rel.isPrivate) &&
                !(hideSkolem && rel.isSkolem) &&
                theme.resolve('attribute', rel, model)
            )
                this.edgesAsAttribute(rel);

        for (const [node, lines] of this.attribs) for (const s of [...lines].sort(javaStringCompare)) node.addLabel(s);

        for (const rel of relations) {
            const n = counts.get(rel.key) ?? 0;
            const color = magicColor.get(rel.key) ?? '#000000';
            this.graph.addLegend(rel.key, n > 0 ? `${rel.name}: ${n}` : rel.name, n > 0 ? color : null);
        }
    }

    private hiddenType(type: AlloyType): boolean {
        return (this.theme.hidePrivate && type.isPrivate) || (this.theme.hideMeta && type.isMeta);
    }

    /** Returns the node of an atom, creating it; null if the atom is hidden. */
    private createNode(atom: AlloyAtom, magicColor?: string): GraphNode | null {
        const { theme, instance, graph } = this;
        const existing = this.atom2node.get(atom.key);
        if (existing) {
            if (theme.nodeColor(atom, instance) === 'Magic' && magicColor) existing.setColor(magicColor);
            return existing;
        }
        if (this.hiddenType(atom.type) || !theme.nodeVisible(atom, instance)) return null;
        for (const set of instance.atom2sets(atom)) if (theme.hidePrivate && set.isPrivate) return null;

        const color = theme.nodeColor(atom, instance);
        const node = new GraphNode(graph, atom.toString(), this.atomName(atom, false))
            .setShape(theme.shape(atom, instance))
            .setStyle(theme.nodeStyle(atom, instance));
        node.data = { atom } satisfies AtomNodeData;
        node.setColor(color === 'Magic' && magicColor ? magicColor : dotColorToCss(color, theme.nodePalette));

        // Sets the atom belongs to, shown as "(set1, set2)".
        const showByDefault = theme.get('showAsLabel', null) ?? true;
        const setLabels: string[] = [];
        for (const set of instance.atom2sets(atom)) {
            const x = theme.label(set);
            if (!x || (theme.hideSkolem && set.isSkolem)) continue;
            const show = theme.get('showAsLabel', set);
            if ((show === undefined && showByDefault) || show) setLabels.push(x);
        }
        if (setLabels.length > 0) this.attrib(node).add(`(${setLabels.join(', ')})`);
        this.atom2node.set(atom.key, node);
        return node;
    }

    private attrib(node: GraphNode): Set<string> {
        let set = this.attribs.get(node);
        if (!set) this.attribs.set(node, (set = new Set()));
        return set;
    }

    private createEdge(rel: AlloyRelation, tuple: AlloyTuple, bidirectional: boolean, magicColor: string): boolean {
        const { theme, instance, model } = this;
        for (const end of [tuple.start, tuple.end])
            if (this.hiddenType(end.type) || !theme.nodeVisible(end, instance)) return false;
        const start = this.createNode(tuple.start);
        const end = this.createNode(tuple.end);
        if (!start || !end) return false;
        const layoutBack = theme.resolve('layoutBack', rel, model);
        let label = theme.label(rel);
        // For tuples (A,B,C,D) the edge goes from A to D and is labelled "R [B, C]".
        if (tuple.arity > 2 && label.length > 0) {
            const middle = tuple.atoms.slice(1, -1).map((a) => this.atomName(a, false));
            label = `${label} [${middle.join(', ')}]`;
        }
        const dir = bidirectional ? 'both' : layoutBack ? 'back' : 'forward';
        const color = theme.resolve('edgeColor', rel, model);
        const weight = theme.weight(rel);
        const edge = new GraphEdge(
            layoutBack ? end : start,
            layoutBack ? start : end,
            tuple.toString(),
            label,
            rel.key,
            {
                color: color === 'Magic' ? magicColor : dotColorToCss(color, theme.edgePalette),
                style: theme.resolve('edgeStyle', rel, model),
                data: { tuple, relation: rel } satisfies TupleEdgeData,
            }
        );
        edge.setHeads(dir !== 'forward', dir !== 'back');
        edge.setWeight(weight < 1 ? 1 : weight > 100 ? 10000 : 100 * weight);
        return true;
    }

    /** Creates edges for the visible tuples; returns how many tuples were drawn. */
    private edgesAsArcs(rel: AlloyRelation, magicColor: string): number {
        const tuples = this.instance.relation2tuples(rel);
        let count = 0;
        if (!this.theme.resolve('mergeArrows', rel, this.model)) {
            for (const t of tuples) if (this.createEdge(rel, t, false, magicColor)) count++;
            return count;
        }
        // Draw a tuple and its reverse as one bidirectional arrow.
        const keys = new Set(tuples.map((t) => t.key));
        const ignore = new Set<string>();
        for (const tuple of tuples) {
            if (ignore.has(tuple.key)) continue;
            const reverse = tuple.arity > 2 ? null : tuple.reverse();
            if (reverse && keys.has(reverse.key) && reverse.key !== tuple.key) {
                ignore.add(reverse.key);
                if (this.createEdge(rel, tuple, true, magicColor)) count += 2;
            } else if (this.createEdge(rel, tuple, false, magicColor)) count += 1;
        }
        return count;
    }

    /** Shows the relation as "rel: B, C" lines on the nodes of its first column. */
    private edgesAsAttribute(rel: AlloyRelation) {
        const map = new Map<GraphNode, string>();
        for (const tuple of this.instance.relation2tuples(rel)) {
            const start = this.atom2node.get(tuple.start.key);
            if (!start) continue;
            const attr = tuple.atoms
                .slice(1)
                .map((a) => this.atomName(a, true))
                .join('->');
            if (!attr) continue;
            const old = map.get(start);
            map.set(start, old ? `${old}, ${attr}` : attr);
        }
        const label = this.theme.label(rel);
        for (const [node, attr] of map) this.attrib(node).add(label ? `${label}: ${attr}` : attr);
    }

    /** The label of an atom, optionally followed by the sets shown in relational attributes. */
    private atomName(atom: AlloyAtom, showSets: boolean): string {
        const { theme, model, instance } = this;
        const label = theme.atomName(atom, theme.resolve('number', atom.type, model));
        if (!showSets) return label;
        const byDefault = theme.get('showAsAttr', null) ?? false;
        const sets: string[] = [];
        for (const set of instance.atom2sets(atom)) {
            const x = theme.label(set);
            if (!x) continue;
            const show = theme.get('showAsAttr', set);
            if ((show === undefined && byDefault) || show) sets.push(x);
        }
        const attr = sets.join(', ');
        if (!label) return attr ? `(${attr})` : '';
        return attr ? `${label} (${attr})` : label;
    }
}

/** Java's String.compareTo (UTF-16 code unit order), used by Alloy's TreeSet of labels. */
function javaStringCompare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
