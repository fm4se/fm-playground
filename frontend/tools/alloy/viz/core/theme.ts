/**
 * Visualizer theme: the customizations applied to a graph.
 *
 * Port of the theme part of edu.mit.csail.sdg.alloy4viz.VizState. Settings are
 * stored per element key (see model.ts) so a theme is plain JSON, survives
 * re-running the model and can be persisted. The key DEFAULT holds the value
 * every element inherits when nothing more specific is set (Alloy's `null` key).
 */
import {
    AlloyAtom,
    AlloyElement,
    AlloyInstance,
    AlloyModel,
    AlloyRelation,
    AlloySet,
    AlloyType,
    INT_MAX,
    slashCompare,
} from './model';
import { DotColor, DotPalette, DotShape, DotStyle } from './dot';

export const DEFAULT = '*';

export interface PerElement {
    nodeColor: Record<string, DotColor>;
    edgeColor: Record<string, DotColor>;
    nodeStyle: Record<string, DotStyle>;
    edgeStyle: Record<string, DotStyle>;
    shape: Record<string, DotShape>;
    label: Record<string, string>;
    weight: Record<string, number>;
    attribute: Record<string, boolean>;
    mergeArrows: Record<string, boolean>;
    constraint: Record<string, boolean>;
    layoutBack: Record<string, boolean>;
    edgeVisible: Record<string, boolean>;
    nodeVisible: Record<string, boolean>;
    number: Record<string, boolean>;
    hideUnconnected: Record<string, boolean>;
    showAsAttr: Record<string, boolean>;
    showAsLabel: Record<string, boolean>;
}

/** Properties whose unset value is inherited from the parent element. */
export type InheritedProp = Exclude<keyof PerElement, 'label' | 'weight'>;
type ValueOf<P extends keyof PerElement> = PerElement[P][string];

export interface ThemeData extends PerElement {
    useOriginalNames: boolean;
    hidePrivate: boolean;
    hideMeta: boolean;
    hideSkolem: boolean;
    fontSize: number;
    nodePalette: DotPalette;
    edgePalette: DotPalette;
    /** Names of the types projected over. */
    projected: string[];
}

export const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72];

const PER_ELEMENT_KEYS: (keyof PerElement)[] = [
    'nodeColor',
    'edgeColor',
    'nodeStyle',
    'edgeStyle',
    'shape',
    'label',
    'weight',
    'attribute',
    'mergeArrows',
    'constraint',
    'layoutBack',
    'edgeVisible',
    'nodeVisible',
    'number',
    'hideUnconnected',
    'showAsAttr',
    'showAsLabel',
];

const keyOf = (el: AlloyElement | null) => (el ? el.key : DEFAULT);

export class VizTheme {
    private constructor(readonly data: ThemeData) {}

    /** Alloy's default theme (VizState.resetTheme); variable relations of `model` are drawn dashed. */
    static createDefault(model?: AlloyModel): VizTheme {
        const d: ThemeData = {
            useOriginalNames: false,
            hidePrivate: true,
            hideMeta: true,
            hideSkolem: false,
            fontSize: 12,
            nodePalette: 'Classic',
            edgePalette: 'Classic',
            projected: [],
            nodeColor: { [DEFAULT]: 'Yellow' },
            nodeStyle: { [DEFAULT]: 'Solid' },
            nodeVisible: { [DEFAULT]: true },
            label: { [DEFAULT]: '' },
            number: { [DEFAULT]: true },
            hideUnconnected: { [DEFAULT]: false },
            showAsAttr: { [DEFAULT]: false },
            showAsLabel: { [DEFAULT]: true },
            shape: { [DEFAULT]: 'Box' },
            weight: { [DEFAULT]: 0 },
            attribute: { [DEFAULT]: false },
            mergeArrows: { [DEFAULT]: true },
            constraint: { [DEFAULT]: true },
            layoutBack: { [DEFAULT]: false },
            edgeColor: { [DEFAULT]: 'Magic' },
            edgeStyle: { [DEFAULT]: 'Solid' },
            edgeVisible: { [DEFAULT]: true },
        };
        // Nicer defaults for integers.
        for (const t of [AlloyType.INT, AlloyType.SEQINT]) {
            d.label[t.key] = '';
            d.number[t.key] = true;
            d.hideUnconnected[t.key] = true;
        }
        // Metamodel defaults, as in Alloy.
        d.nodeStyle[AlloySet.VAR.key] = 'Dashed';
        d.shape[AlloyType.SET.key] = 'Ellipse';
        d.nodeColor[AlloyType.SET.key] = 'Blue';
        d.label[AlloyType.SET.key] = '';
        for (const r of [AlloyRelation.EXTENDS, AlloyRelation.MEMBER, AlloyRelation.IN, AlloyRelation.EQ]) {
            d.edgeColor[r.key] = 'Black';
            d.weight[r.key] = 100;
            d.layoutBack[r.key] = true;
        }
        for (const r of model?.relations ?? []) if (r.isVar) d.edgeStyle[r.key] = 'Dashed';
        return new VizTheme(d);
    }

    /** Restores a theme from JSON, filling in anything missing with defaults. */
    static fromJSON(json: unknown): VizTheme {
        const base = VizTheme.createDefault().data;
        const src = (json && typeof json === 'object' ? json : {}) as Partial<ThemeData>;
        const data: ThemeData = { ...base, ...src, projected: Array.isArray(src.projected) ? [...src.projected] : [] };
        for (const k of PER_ELEMENT_KEYS) (data as any)[k] = { ...(base as any)[k], ...((src as any)[k] ?? {}) };
        return new VizTheme(data);
    }

    toJSON(): ThemeData {
        return this.data;
    }

    /** Returns a modified copy; the callback may mutate the copy freely. */
    with(mutate: (t: MutableTheme) => void): VizTheme {
        const copy = new MutableTheme(structuredClone(this.data));
        mutate(copy);
        return new VizTheme(copy.data);
    }

    get useOriginalNames() {
        return this.data.useOriginalNames;
    }
    get hidePrivate() {
        return this.data.hidePrivate;
    }
    get hideMeta() {
        return this.data.hideMeta;
    }
    get hideSkolem() {
        return this.data.hideSkolem;
    }
    get fontSize() {
        return this.data.fontSize;
    }
    get nodePalette() {
        return this.data.nodePalette;
    }
    get edgePalette() {
        return this.data.edgePalette;
    }
    get projected(): readonly string[] {
        return this.data.projected;
    }

    /** The value set directly on the element (undefined means "inherit"). */
    get<P extends keyof PerElement>(prop: P, el: AlloyElement | null): ValueOf<P> | undefined {
        return this.data[prop][keyOf(el)] as ValueOf<P> | undefined;
    }

    /** The effective value: walks set -> type -> supertypes -> default (MMap.resolve). */
    resolve<P extends InheritedProp>(prop: P, el: AlloyElement | null, model: AlloyModel): ValueOf<P> {
        for (let x: AlloyElement | null = el; x; x = parentOf(x, model)) {
            const v = this.get(prop, x);
            if (v !== undefined) return v;
        }
        return this.data[prop][DEFAULT] as ValueOf<P>;
    }

    /** The label of an element; defaults to its name. */
    label(el: AlloyElement | null): string {
        const v = this.data.label[keyOf(el)];
        return v !== undefined ? v : el ? el.name.trim() : '';
    }

    weight(el: AlloyElement | null): number {
        return this.data.weight[keyOf(el)] ?? 0;
    }

    nodeColor(atom: AlloyAtom, instance: AlloyInstance): DotColor {
        return this.atomProp('nodeColor', atom, instance);
    }

    nodeStyle(atom: AlloyAtom, instance: AlloyInstance): DotStyle {
        return this.atomProp('nodeStyle', atom, instance);
    }

    shape(atom: AlloyAtom, instance: AlloyInstance): DotShape {
        return this.atomProp('shape', atom, instance);
    }

    /** Visible if any (non-hidden) set containing it is visible; otherwise decided by its type. */
    nodeVisible(atom: AlloyAtom, instance: AlloyInstance): boolean {
        let any = false;
        for (const s of instance.atom2sets(atom)) {
            if (this.hideSkolem && s.isSkolem) continue;
            any = true;
            if (this.resolve('nodeVisible', s, instance.model)) return true;
        }
        return any ? false : this.resolve('nodeVisible', atom.type, instance.model);
    }

    /** A set's own value wins over the type's, in set order. */
    private atomProp<P extends 'nodeColor' | 'nodeStyle' | 'shape'>(
        prop: P,
        atom: AlloyAtom,
        instance: AlloyInstance
    ): ValueOf<P> {
        for (const s of instance.atom2sets(atom)) {
            const v = this.get(prop, s);
            if (v !== undefined && !(this.hideSkolem && s.isSkolem)) return v;
        }
        return this.resolve(prop, atom.type, instance.model);
    }

    /** The label of an atom (AlloyAtom.getVizName). */
    atomName(atom: AlloyAtom, numberAtoms: boolean): string {
        const typeName = atom.type.name;
        if (this.useOriginalNames || typeName === 'String') return atom.originalName;
        const label = this.label(atom.type);
        if (atom.index === INT_MAX || !numberAtoms) return label;
        return label + atom.index;
    }

    /** True iff the type is a toplevel sig that is not variable (VizState.canProject). */
    static canProject(type: AlloyType, originalModel: AlloyModel): boolean {
        return originalModel.getSuperType(type)?.name === 'univ' && !type.isVar;
    }

    /**
     * Variable types/sets/relations without an explicit style are drawn dashed
     * (VizState.applyDefaultVar, applied whenever Alloy draws a graph).
     */
    withDefaultVarStyles(model: AlloyModel): VizTheme {
        return this.with((t) => {
            for (const r of model.types) {
                const sup = model.getSuperType(r);
                if (
                    t.get('nodeStyle', r) === undefined &&
                    r.isVar &&
                    !(sup && (sup.isVar || t.get('nodeStyle', sup) !== undefined))
                )
                    t.set('nodeStyle', r, 'Dashed');
            }
            for (const r of model.relations)
                if (t.get('edgeStyle', r) === undefined && r.isVar) t.set('edgeStyle', r, 'Dashed');
            for (const s of model.sets)
                if (
                    t.get('nodeStyle', s) === undefined &&
                    s.isVar &&
                    !(s.type.isVar || t.get('nodeStyle', s.type) !== undefined)
                )
                    t.set('nodeStyle', s, 'Dashed');
        });
    }
}

/** A theme being edited inside VizTheme.with(). */
export class MutableTheme {
    constructor(readonly data: ThemeData) {}

    get<P extends keyof PerElement>(prop: P, el: AlloyElement | null): ValueOf<P> | undefined {
        return this.data[prop][keyOf(el)] as ValueOf<P> | undefined;
    }

    /** Sets (or with undefined, clears) a value. Clearing the default is ignored. */
    set<P extends keyof PerElement>(prop: P, el: AlloyElement | null, value: ValueOf<P> | undefined): void {
        const map = this.data[prop] as Record<string, unknown>;
        if (value === undefined) {
            if (el) delete map[el.key];
        } else map[keyOf(el)] = value;
    }

    /** Sets a label; setting an element's own name removes the override. */
    setLabel(el: AlloyElement | null, value: string): void {
        if (el && el.name === value) delete this.data.label[el.key];
        else this.data.label[keyOf(el)] = value;
    }

    label(el: AlloyElement): string {
        const v = this.data.label[el.key];
        return v !== undefined ? v : el.name.trim();
    }

    setWeight(el: AlloyElement | null, value: number): void {
        this.data.weight[keyOf(el)] = Math.max(0, Math.round(value) || 0);
    }

    project(typeName: string): void {
        if (!this.data.projected.includes(typeName))
            this.data.projected = [...this.data.projected, typeName].sort(slashCompare);
    }

    deproject(typeName: string): void {
        this.data.projected = this.data.projected.filter((n) => n !== typeName);
    }
}

function parentOf(x: AlloyElement, model: AlloyModel): AlloyElement | null {
    if (x.kind === 'set') return x.type;
    if (x.kind === 'type') return model.getSuperType(x);
    return null;
}
