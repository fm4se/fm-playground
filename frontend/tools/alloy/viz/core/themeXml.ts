/**
 * Reading and writing Alloy theme files (.thm), compatible with the Alloy Analyzer.
 * Port of edu.mit.csail.sdg.alloy4viz.StaticThemeReaderWriter.
 *
 * Elements are matched by name (types), name+type (sets) and name+types
 * (relations), so a theme can be loaded even for elements absent from the current
 * model; they simply have no effect.
 */
import { AlloyModel, relationKey, setKey, typeKey } from './model';
import { isDotColor, isDotPalette, isDotShape, isDotStyle } from './dot';
import { DEFAULT, MutableTheme, VizTheme } from './theme';

type Prop = keyof MutableTheme['data'];

/** Parses a .thm file. Throws if it is not a valid theme file. */
export function parseThemeXml(xmlText: string, model?: AlloyModel): VizTheme {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0 || doc.documentElement.nodeName !== 'alloy')
        throw new Error('This is not a valid Alloy theme file.');
    let theme = VizTheme.createDefault(model);
    for (const view of children(doc.documentElement, 'view')) theme = theme.with((t) => parseView(view, t));
    return theme;
}

function children(el: Element, name: string): Element[] {
    return Array.from(el.children).filter((c) => c.nodeName === name);
}

const has = (x: Element, attr: string) => x.hasAttribute(attr);

function getBool(x: Element, attr: string): boolean | undefined {
    const v = (x.getAttribute(attr) ?? '').toLowerCase();
    if (v === 'yes' || v === 'true') return true;
    if (v === 'no' || v === 'false') return false;
    return undefined;
}

function getInt(x: Element, attr: string): number {
    const n = parseInt(x.getAttribute(attr) ?? '', 10);
    return Number.isFinite(n) ? n : 0;
}

/** Stores a value for a key; undefined clears it (but the default is never cleared). */
function put(t: MutableTheme, prop: Prop, key: string, value: unknown) {
    const map = t.data[prop] as Record<string, unknown>;
    if (value === undefined || value === null) {
        if (key !== DEFAULT) delete map[key];
    } else map[key] = value;
}

function parseView(x: Element, t: MutableTheme) {
    for (const p of children(x, 'projection')) {
        t.data.projected = [];
        for (const ty of children(p, 'type')) {
            const name = ty.getAttribute('name');
            if (name) t.project(name);
        }
    }
    if (has(x, 'useOriginalAtomNames')) t.data.useOriginalNames = getBool(x, 'useOriginalAtomNames') ?? false;
    if (has(x, 'hidePrivate')) t.data.hidePrivate = getBool(x, 'hidePrivate') ?? t.data.hidePrivate;
    if (has(x, 'hideMeta')) t.data.hideMeta = getBool(x, 'hideMeta') ?? t.data.hideMeta;
    if (has(x, 'hideSkolem')) t.data.hideSkolem = getBool(x, 'hideSkolem') ?? t.data.hideSkolem;
    if (has(x, 'fontsize') && getInt(x, 'fontsize') > 0) t.data.fontSize = getInt(x, 'fontsize');
    const np = x.getAttribute('nodetheme');
    if (isDotPalette(np)) t.data.nodePalette = np;
    const ep = x.getAttribute('edgetheme');
    if (isDotPalette(ep)) t.data.edgePalette = ep;

    for (const el of Array.from(x.children)) {
        if (el.nodeName === 'defaultnode') parseNodeViz(el, t, DEFAULT, 'default');
        else if (el.nodeName === 'defaultedge') parseEdgeViz(el, t, DEFAULT);
        else if (el.nodeName === 'node') {
            for (const ty of children(el, 'type')) {
                const name = ty.getAttribute('name');
                if (name) parseNodeViz(el, t, typeKey(name), 'type');
            }
            for (const s of children(el, 'set')) {
                const name = s.getAttribute('name');
                const type = s.getAttribute('type');
                if (name && type) parseNodeViz(el, t, setKey(name, type), 'set');
            }
        } else if (el.nodeName === 'edge') {
            for (const r of children(el, 'relation')) {
                const name = r.getAttribute('name');
                const types = children(r, 'type').map((ty) => ty.getAttribute('name') ?? '');
                if (name && types.length >= 2 && types.every((n) => n)) parseEdgeViz(el, t, relationKey(name, types));
            }
        }
    }
}

function parseNodeViz(xml: Element, t: MutableTheme, key: string, kind: 'default' | 'type' | 'set') {
    if (has(xml, 'visible')) put(t, 'nodeVisible', key, getBool(xml, 'visible'));
    if (has(xml, 'hideunconnected')) put(t, 'hideUnconnected', key, getBool(xml, 'hideunconnected'));
    if (kind !== 'type') {
        if (has(xml, 'showlabel')) put(t, 'showAsLabel', key, getBool(xml, 'showlabel'));
        if (has(xml, 'showinattr')) put(t, 'showAsAttr', key, getBool(xml, 'showinattr'));
    }
    if (kind !== 'set' && has(xml, 'numberatoms')) put(t, 'number', key, getBool(xml, 'numberatoms'));
    if (has(xml, 'style')) put(t, 'nodeStyle', key, asOrUndefined(xml.getAttribute('style'), isDotStyle));
    if (has(xml, 'color')) put(t, 'nodeColor', key, asOrUndefined(xml.getAttribute('color'), isDotColor));
    if (has(xml, 'shape')) put(t, 'shape', key, asOrUndefined(xml.getAttribute('shape'), isDotShape));
    if (has(xml, 'label')) putLabel(t, key, xml.getAttribute('label') ?? '');
}

function parseEdgeViz(xml: Element, t: MutableTheme, key: string) {
    if (has(xml, 'visible')) put(t, 'edgeVisible', key, getBool(xml, 'visible'));
    if (has(xml, 'attribute')) put(t, 'attribute', key, getBool(xml, 'attribute'));
    if (has(xml, 'merge')) put(t, 'mergeArrows', key, getBool(xml, 'merge'));
    if (has(xml, 'layout')) put(t, 'layoutBack', key, getBool(xml, 'layout'));
    if (has(xml, 'constraint')) put(t, 'constraint', key, getBool(xml, 'constraint'));
    if (has(xml, 'style')) put(t, 'edgeStyle', key, asOrUndefined(xml.getAttribute('style'), isDotStyle));
    if (has(xml, 'color')) put(t, 'edgeColor', key, asOrUndefined(xml.getAttribute('color'), isDotColor));
    if (has(xml, 'weight')) put(t, 'weight', key, Math.max(0, getInt(xml, 'weight')));
    if (has(xml, 'label')) putLabel(t, key, xml.getAttribute('label') ?? '');
}

function putLabel(t: MutableTheme, key: string, label: string) {
    // Like MString.put: a label equal to the element's own name is no override.
    if (key !== DEFAULT && nameOfKey(key) === label) delete t.data.label[key];
    else t.data.label[key] = label;
}

const asOrUndefined = <T>(v: string | null, guard: (x: unknown) => x is T): T | undefined => (guard(v) ? v : undefined);

/** Name part of an element key ("T:name", "S:name:type", "R:name:types"). */
function nameOfKey(key: string): string {
    const rest = key.substring(2);
    return key.startsWith('T:') ? rest : rest.substring(0, rest.indexOf(':'));
}

// ----------------------------------------------------------------- writing

const NODE_PROPS: Prop[] = [
    'nodeVisible',
    'hideUnconnected',
    'showAsLabel',
    'showAsAttr',
    'number',
    'nodeStyle',
    'shape',
    'nodeColor',
    'label',
];
const EDGE_PROPS: Prop[] = [
    'edgeColor',
    'edgeStyle',
    'edgeVisible',
    'mergeArrows',
    'layoutBack',
    'attribute',
    'constraint',
    'weight',
    'label',
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Serializes a theme as a .thm file, writing only what differs from the default theme. */
export function themeToXml(theme: VizTheme, model?: AlloyModel): string {
    const def = VizTheme.createDefault(model).data;
    const d = theme.data;
    const get = (data: typeof d, prop: Prop, key: string) => (data[prop] as Record<string, unknown>)[key];

    const boolAttr = (name: string, prop: Prop, key: string) => {
        const v = get(d, prop, key) as boolean | undefined;
        const dv = get(def, prop, key) as boolean | undefined;
        if (v === undefined && dv === undefined) return '';
        if (v !== undefined && dv !== undefined && v === dv) return '';
        return ` ${name}="${v === undefined ? 'inherit' : v ? 'yes' : 'no'}"`;
    };
    const enumAttr = (name: string, prop: Prop, key: string) => {
        const v = get(d, prop, key);
        return v !== get(def, prop, key) ? ` ${name}="${v === undefined ? 'inherit' : esc(String(v))}"` : '';
    };
    const labelAttr = (key: string) => {
        if (key === DEFAULT) return '';
        const label = (k: string, data: typeof d) => data.label[k] ?? nameOfKey(k).trim();
        return label(key, d) !== label(key, def) ? ` label="${esc(label(key, d))}"` : '';
    };
    const nodeViz = (key: string) => {
        const kind = key === DEFAULT ? 'default' : key.startsWith('T:') ? 'type' : 'set';
        let s = boolAttr('visible', 'nodeVisible', key) + boolAttr('hideunconnected', 'hideUnconnected', key);
        if (kind !== 'type') s += boolAttr('showlabel', 'showAsLabel', key) + boolAttr('showinattr', 'showAsAttr', key);
        if (kind !== 'set') s += boolAttr('numberatoms', 'number', key);
        return (
            s +
            enumAttr('style', 'nodeStyle', key) +
            enumAttr('shape', 'shape', key) +
            enumAttr('color', 'nodeColor', key) +
            labelAttr(key)
        );
    };
    const edgeViz = (key: string) => {
        let s = enumAttr('color', 'edgeColor', key) + enumAttr('style', 'edgeStyle', key);
        s += boolAttr('visible', 'edgeVisible', key) + boolAttr('merge', 'mergeArrows', key);
        s += boolAttr('layout', 'layoutBack', key) + boolAttr('attribute', 'attribute', key);
        s += boolAttr('constraint', 'constraint', key);
        if ((d.weight[key] ?? 0) !== (def.weight[key] ?? 0)) s += ` weight="${d.weight[key] ?? 0}"`;
        return s + labelAttr(key);
    };

    // Every element mentioned by the theme, the defaults or the model; elements outside the
    // model are only written when customized.
    const modelKeys = new Set<string>([
        ...(model?.types ?? []).map((t) => t.key),
        ...(model?.sets ?? []).map((s) => s.key),
        ...(model?.relations ?? []).map((r) => r.key),
    ]);
    const keys = new Set<string>(modelKeys);
    for (const data of [d, def])
        for (const p of [...NODE_PROPS, ...EDGE_PROPS]) Object.keys(data[p] as object).forEach((k) => keys.add(k));
    keys.delete(DEFAULT);
    const sorted = [...keys].sort();

    let out = '<?xml version="1.0"?>\n<alloy>\n\n<view';
    if (d.nodePalette !== def.nodePalette) out += ` nodetheme="${d.nodePalette}"`;
    if (d.edgePalette !== def.edgePalette) out += ` edgetheme="${d.edgePalette}"`;
    if (d.useOriginalNames !== def.useOriginalNames)
        out += ` useOriginalAtomNames="${d.useOriginalNames ? 'yes' : 'no'}"`;
    if (d.hidePrivate !== def.hidePrivate) out += ` hidePrivate="${d.hidePrivate ? 'yes' : 'no'}"`;
    if (d.hideMeta !== def.hideMeta) out += ` hideMeta="${d.hideMeta ? 'yes' : 'no'}"`;
    if (d.hideSkolem !== def.hideSkolem) out += ` hideSkolem="${d.hideSkolem ? 'yes' : 'no'}"`;
    if (d.fontSize !== def.fontSize) out += ` fontsize="${d.fontSize}"`;
    out += '>\n';
    if (d.projected.length > 0)
        out += `\n<projection>${d.projected.map((n) => ` <type name="${esc(n)}"/>`).join('')} </projection>\n`;
    out += `\n<defaultnode${nodeViz(DEFAULT)}/>\n\n<defaultedge${edgeViz(DEFAULT)}/>\n`;

    const groups = (items: string[], viz: (k: string) => string, skipEmpty: boolean) => {
        const byViz = new Map<string, string[]>();
        for (const k of items) {
            const s = viz(k);
            if (!s && (skipEmpty || !modelKeys.has(k))) continue;
            byViz.set(s, [...(byViz.get(s) ?? []), k]);
        }
        return [...byViz.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    };
    for (const [viz, items] of groups(
        sorted.filter((k) => !k.startsWith('R:')),
        nodeViz,
        false
    )) {
        out += `\n<node${viz}>\n`;
        for (const k of items) {
            if (k.startsWith('T:')) out += `   <type name="${esc(k.substring(2))}"/>\n`;
            else {
                const rest = k.substring(2);
                const i = rest.indexOf(':');
                out += `   <set name="${esc(rest.substring(0, i))}" type="${esc(rest.substring(i + 1))}"/>\n`;
            }
        }
        out += '</node>\n';
    }
    for (const [viz, items] of groups(
        sorted.filter((k) => k.startsWith('R:')),
        edgeViz,
        true
    )) {
        out += `\n<edge${viz}>\n`;
        for (const k of items) {
            const rest = k.substring(2);
            const i = rest.indexOf(':');
            const types = rest.substring(i + 1).split('->');
            out += `   <relation name="${esc(rest.substring(0, i))}">${types.map((t) => ` <type name="${esc(t)}"/>`).join('')} </relation>\n`;
        }
        out += '</edge>\n';
    }
    return out + '\n</view>\n\n</alloy>\n';
}
