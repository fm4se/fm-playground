/**
 * "Magic Layout": Alloy's automatic theme heuristics.
 * Port of edu.mit.csail.sdg.alloy4viz.{MagicLayout, MagicColor, MagicUtil}.
 */
import { AlloyModel, AlloyRelation, AlloyType } from './model';
import { projectModel } from './projection';
import { DOT_COLORS, DotShape } from './dot';
import { MutableTheme, VizTheme } from './theme';

/** Resets the theme, then applies Magic Layout and Magic Color for the given (unprojected) model. */
export function magicTheme(originalModel: AlloyModel): VizTheme {
    return VizTheme.createDefault(originalModel).with((t) => {
        const ctx = new MagicContext(t, originalModel);
        magicLayout(ctx);
        magicColor(ctx);
    });
}

class MagicContext {
    constructor(
        readonly theme: MutableTheme,
        readonly originalModel: AlloyModel
    ) {}

    currentModel(): AlloyModel {
        const projected = this.theme.data.projected
            .map((n) => this.originalModel.findType(n))
            .filter((t): t is AlloyType => !!t);
        return projectModel(this.originalModel, projected);
    }

    isTopLevel(t: AlloyType): boolean {
        return this.originalModel.getSuperType(t)?.name === 'univ';
    }

    trimLabelBeforeLastSlash(x: AlloyType | AlloyRelation) {
        const label = this.theme.label(x);
        this.theme.setLabel(x, label.substring(label.lastIndexOf('/') + 1));
    }

    isTypeVisible(t: AlloyType): boolean {
        if (t.isAbstract) return false;
        const v = this.theme.get('nodeVisible', t);
        if (v !== undefined) return v;
        const model = this.currentModel();
        for (let p = model.getSuperType(t); p; p = model.getSuperType(p)) {
            const pv = this.theme.get('nodeVisible', p);
            if (pv !== undefined) return pv;
        }
        return true;
    }

    visibleUserTypes(): AlloyType[] {
        return this.currentModel().types.filter((t) => !t.isBuiltin && this.isTypeVisible(t));
    }

    partiallyVisibleUserTopLevelTypes(): AlloyType[] {
        const result = new Map<string, AlloyType>();
        for (const t of this.visibleUserTypes()) {
            const top = this.originalModel.getTopmostSuperType(t);
            if (top) result.set(top.name, top);
        }
        return [...result.values()];
    }

    visibleSubTypes(type: AlloyType): AlloyType[] {
        const visible = new Set(this.visibleUserTypes().map((t) => t.name));
        return this.currentModel()
            .getSubTypes(type)
            .filter((t) => visible.has(t.name));
    }
}

const LIKELY_PROJECTION_TYPE_NAMES = ['State', 'TrainState', 'Time', 'Tick', 'TimeStep'];

function magicLayout(ctx: MagicContext) {
    const theme = ctx.theme;
    const enumerationTypes = new Set<string>();
    let projectionType: AlloyType | null = null;

    // Enumerations: abstract sigs all of whose subsigs are singletons.
    {
        const model = ctx.currentModel();
        for (const t of model.types) {
            if (enumerationTypes.has(t.name) || t.isBuiltin || !t.isAbstract) continue;
            const subTypes = model.getSubTypes(t);
            if (subTypes.every((st) => st.isOne)) {
                enumerationTypes.add(t.name);
                subTypes.forEach((st) => enumerationTypes.add(st.name));
                for (const st of subTypes) theme.set('nodeVisible', st, undefined);
                // Hidden unless they are the source of some relation.
                const visible = model.relations.some(
                    (r) => r.types[0].name === t.name || subTypes.some((st) => st.name === r.types[0].name)
                );
                theme.set('nodeVisible', t, visible);
            }
        }
    }

    // Projection over a type that looks like time (by name, or by being in ternary relations).
    if (theme.data.projected.length === 0) {
        const model = ctx.currentModel();
        let max = 0;
        let winner: AlloyType | null = null;
        for (const t of model.types) {
            let score = LIKELY_PROJECTION_TYPE_NAMES.some((s) => t.name.startsWith(s) || t.name.endsWith(s)) ? 1 : 0;
            for (const r of model.relations) if (r.arity > 2 && r.types.some((x) => x.name === t.name)) score++;
            if (score > max) {
                max = score;
                winner = t;
            } else if (score === max && winner === null) winner = t;
        }
        if (max >= 2 && winner) {
            projectionType = winner;
            if (VizTheme.canProject(winner, ctx.originalModel)) theme.project(winner.name);
        }
    }

    // Hide the ordering module's private sig.
    {
        const model = ctx.currentModel();
        for (const t of model.types)
            if (!t.isBuiltin && ctx.isTypeVisible(t) && t.name.endsWith('/Ord')) theme.set('nodeVisible', t, false);
        for (const s of model.sets) {
            const visible = theme.get('nodeVisible', s) ?? ctx.isTypeVisible(s.type);
            if (visible && s.name.endsWith('/Ord')) theme.set('nodeVisible', s, false);
        }
    }

    // Spine: binary relations not pointing into an enumeration drive the layout and stay black.
    let spineRelations: readonly AlloyRelation[] = [];
    {
        const model = ctx.currentModel();
        const relations = model.relations;
        if (relations.length > 0) {
            const spines: AlloyRelation[] = [];
            for (const r of relations) {
                if (r.arity !== 2) continue;
                if (!enumerationTypes.has(r.types[1].name)) spines.push(r);
                if (r.name === 'parent') theme.set('layoutBack', r, true);
            }
            spineRelations = spines.length === 0 ? relations : spines;
        }
        for (const r of relations) {
            theme.set('constraint', r, false);
            theme.set('edgeColor', r, 'Gray');
        }
        for (const s of spineRelations) {
            theme.set('constraint', s, undefined);
            theme.set('edgeColor', s, undefined);
        }
    }

    // Binary non-spine relations into an enumeration become node attributes.
    {
        const model = ctx.currentModel();
        const spineKeys = new Set(spineRelations.map((r) => r.key));
        for (const r of model.relations) {
            if (
                r.arity === 2 &&
                !r.types.some((t) => t.name === projectionType?.name) &&
                !spineKeys.has(r.key) &&
                enumerationTypes.has(r.types[1].name)
            ) {
                theme.set('attribute', r, true);
                theme.set('edgeVisible', r, false);
            }
        }
    }

    // Edge labels: drop module prefixes; no label at all if only one binary relation is shown.
    {
        const model = ctx.currentModel();
        let shown = 0;
        let visibleRelation: AlloyRelation | null = null;
        for (const r of model.relations) {
            const v = theme.get('edgeVisible', r);
            if (v === undefined || v) {
                shown++;
                visibleRelation = r;
                ctx.trimLabelBeforeLastSlash(r);
            }
        }
        if (shown === 1 && visibleRelation && visibleRelation.arity === 2) theme.setLabel(visibleRelation, '');
    }
}

const SHAPE_FAMILIES: DotShape[][] = [
    ['Box', 'Trapezoid', 'House'],
    ['Ellipse', 'Egg'],
    ['Hexagon', 'Octagon', 'Dbl Octagon', 'Tpl Octagon'],
    ['Inv Triangle', 'Inv House', 'Inv Trapezoid'],
    ['Lined Diamond', 'Lined Square', 'Lined Circle'],
    ['Parallelogram', 'Diamond'],
];

function magicColor(ctx: MagicContext) {
    const theme = ctx.theme;
    theme.data.nodePalette = 'Martha';

    // Names: drop module prefixes; no type name at all if only one type is shown.
    {
        const visible = ctx.visibleUserTypes();
        for (const t of visible) ctx.trimLabelBeforeLastSlash(t);
        if (visible.length === 1) theme.setLabel(visible[0], '');
    }

    // Shapes: each toplevel type family gets its own family of shapes.
    {
        const used = new Set<DotShape[]>();
        for (const t of ctx.partiallyVisibleUserTopLevelTypes()) {
            const subTypes = ctx.visibleSubTypes(t);
            const isTVisible = ctx.isTypeVisible(t);
            const size = subTypes.length + (isTVisible ? 1 : 0);
            let family = SHAPE_FAMILIES.find((f) => f.length === size && !used.has(f));
            if (!family) {
                let best = Number.MAX_SAFE_INTEGER;
                for (const f of SHAPE_FAMILIES)
                    if (size <= f.length && !used.has(f) && f.length - size < best) {
                        best = f.length - size;
                        family = f;
                    }
            }
            if (!family) continue;
            used.add(family);
            let i = 0;
            if (isTVisible) theme.set('shape', t, family[i++]);
            for (const st of subTypes) theme.set('shape', st, family[i++]);
        }
    }

    // Colors: a distinct color per visible type, or per toplevel type if there are many.
    {
        const visible = ctx.visibleUserTypes();
        const unique = visible.length <= 5 ? visible : ctx.partiallyVisibleUserTopLevelTypes();
        unique.forEach((t, i) => theme.set('nodeColor', t, DOT_COLORS[i % DOT_COLORS.length]));
    }

    // Sets (skolems in particular): bold, and labelled by the part after the last underscore.
    for (const s of ctx.currentModel().sets) {
        theme.set('nodeStyle', s, 'Bold');
        const label = theme.label(s);
        theme.setLabel(s, label.substring(label.lastIndexOf('_') + 1));
    }
}
