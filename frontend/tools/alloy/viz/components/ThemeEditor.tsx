/**
 * Theme customization panel, modeled on Alloy's VizCustomizationPanel: a tree of
 * general settings, types/sets and relations, and an editor for the selected
 * entry. Unset values are inherited (set -> type -> supertype -> default).
 */
import React, { useMemo, useRef } from 'react';
import { AlloyElement, AlloyModel, AlloyRelation, AlloySet, AlloyType } from '../core/model';
import { DOT_COLORS, DOT_PALETTES, DOT_SHAPES, DOT_STYLES, DotPalette } from '../core/dot';
import { FONT_SIZES, InheritedProp, MutableTheme, VizTheme } from '../core/theme';
import { projectModel } from '../core/projection';

export type ThemeSelection = 'general' | 'nodes' | 'edges' | string;

interface ThemeEditorProps {
    theme: VizTheme;
    originalModel: AlloyModel;
    selection: ThemeSelection;
    onSelect: (s: ThemeSelection) => void;
    onChange: (theme: VizTheme) => void;
    onMagicLayout: () => void;
    onReset: () => void;
    onLoadThm: (text: string) => void;
    onSaveThm: () => void;
    onClose: () => void;
}

const ThemeEditor: React.FC<ThemeEditorProps> = (props) => {
    const { theme, originalModel, selection, onSelect, onChange } = props;
    const fileRef = useRef<HTMLInputElement>(null);
    const currentModel = useMemo(
        () =>
            projectModel(
                originalModel,
                theme.projected.map((n) => originalModel.findType(n)).filter((t): t is AlloyType => !!t)
            ),
        [originalModel, theme.projected]
    );
    const edit = (mutate: (t: MutableTheme) => void) => onChange(theme.with(mutate));

    const hidden = (x: { isPrivate: boolean; isMeta: boolean; isSkolem?: boolean }) =>
        (theme.hidePrivate && x.isPrivate) || (theme.hideMeta && x.isMeta) || (theme.hideSkolem && !!x.isSkolem);

    // ----- tree -----
    const typeChildren = (type: AlloyType): AlloyElement[] => {
        const list: AlloyElement[] = currentModel.sets.filter((s) => s.type.name === type.name && !hidden(s));
        if (!type.isEnum)
            for (const t of originalModel.getDirectSubTypes(type))
                if (!hidden(t) && (currentModel.hasType(t) || VizTheme.canProject(t, originalModel))) list.push(t);
        return list;
    };
    const rows: { key: ThemeSelection; depth: number; label: React.ReactNode }[] = [
        { key: 'general', depth: 0, label: <b>general graph settings</b> },
        { key: 'nodes', depth: 0, label: <b>types and sets</b> },
    ];
    const addType = (el: AlloyElement, depth: number) => {
        if (el.kind === 'set') {
            rows.push({
                key: el.key,
                depth,
                label: (
                    <>
                        <b>set</b> {el.name}
                    </>
                ),
            });
            return;
        }
        if (el.kind !== 'type') return;
        const projected = !currentModel.hasType(el);
        rows.push({
            key: el.key,
            depth,
            label: (
                <>
                    <b>sig</b> {typeName(el, originalModel)}
                    {projected && <span className='alloy-theme-muted'> (projected)</span>}
                </>
            ),
        });
        typeChildren(el).forEach((c) => addType(c, depth + 1));
    };
    addType(AlloyType.UNIV, 1);
    rows.push({ key: 'edges', depth: 0, label: <b>relations</b> });
    for (const r of currentModel.relations) if (!hidden(r)) rows.push({ key: r.key, depth: 1, label: r.toString() });

    const element = findElement(selection, originalModel, currentModel);

    return (
        <div className='alloy-theme-panel' onMouseDown={(e) => e.stopPropagation()}>
            <div className='alloy-theme-header'>
                <span>Theme</span>
                <button className='alloy-viz-icon-btn' onClick={props.onClose} title='Close'>
                    ×
                </button>
            </div>
            <div className='alloy-theme-actions'>
                <button onClick={props.onMagicLayout} title='Automatic theme customization (resets the current theme)'>
                    Magic Layout
                </button>
                <button onClick={props.onReset} title='Reset to the default theme'>
                    Reset
                </button>
                <button onClick={() => fileRef.current?.click()} title='Load an Alloy theme (.thm) file'>
                    Load .thm
                </button>
                <button onClick={props.onSaveThm} title='Save the theme as an Alloy theme (.thm) file'>
                    Save .thm
                </button>
                <input
                    ref={fileRef}
                    type='file'
                    accept='.thm,.xml'
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) file.text().then(props.onLoadThm);
                        e.target.value = '';
                    }}
                />
            </div>
            <div className='alloy-theme-editor'>
                {selection === 'general' && <GeneralEditor theme={theme} edit={edit} />}
                {selection === 'nodes' && <DefaultNodeEditor theme={theme} edit={edit} />}
                {selection === 'edges' && <DefaultEdgeEditor theme={theme} edit={edit} />}
                {element && element.kind !== 'rel' && (
                    <NodeEditor
                        key={element.key}
                        el={element}
                        theme={theme}
                        edit={edit}
                        originalModel={originalModel}
                        currentModel={currentModel}
                    />
                )}
                {element && element.kind === 'rel' && (
                    <EdgeEditor key={element.key} rel={element} theme={theme} edit={edit} currentModel={currentModel} />
                )}
            </div>
            <div className='alloy-theme-tree'>
                {rows.map((r) => (
                    <div
                        key={String(r.key)}
                        className={'alloy-theme-row' + (r.key === selection ? ' selected' : '')}
                        style={{ paddingLeft: 6 + r.depth * 14 }}
                        onClick={() => onSelect(r.key)}
                    >
                        {r.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

function typeName(type: AlloyType, model: AlloyModel): string {
    if (type.name === 'univ') return 'univ';
    const sup = model.getSuperType(type);
    return sup && sup.name !== 'univ' ? `${type.name} extends ${sup.name}` : type.name;
}

function findElement(key: ThemeSelection, original: AlloyModel, current: AlloyModel): AlloyElement | undefined {
    if (key.startsWith('T:')) return original.findType(key.substring(2));
    if (key.startsWith('S:')) return current.sets.find((s) => s.key === key);
    if (key.startsWith('R:')) return current.relations.find((r) => r.key === key);
    return undefined;
}

type Edit = (mutate: (t: MutableTheme) => void) => void;

// ----- widgets -----

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <label className='alloy-theme-field'>
        <span>{label}</span>
        {children}
    </label>
);

function Select<T extends string | number>(props: {
    value: T | undefined;
    options: readonly T[];
    onChange: (v: T | undefined) => void;
    /** If given, an "Inherit" option is offered, showing the inherited value. */
    inherited?: T;
    disabled?: boolean;
}) {
    const { value, options, onChange, inherited, disabled } = props;
    return (
        <select
            value={value === undefined ? '' : String(value)}
            disabled={disabled}
            onChange={(e) => {
                const v = e.target.value;
                onChange(v === '' ? undefined : (options.find((o) => String(o) === v) as T));
            }}
        >
            {inherited !== undefined && <option value=''>Inherit ({String(inherited)})</option>}
            {options.map((o) => (
                <option key={String(o)} value={String(o)}>
                    {String(o)}
                </option>
            ))}
        </select>
    );
}

/** A checkbox with Alloy's three states: inherited, explicitly on, explicitly off. */
const TriState: React.FC<{
    label: string;
    title?: string;
    value: boolean | undefined;
    inherited: boolean;
    onChange: (v: boolean | undefined) => void;
    disabled?: boolean;
}> = ({ label, title, value, inherited, onChange, disabled }) => {
    const effective = value ?? inherited;
    return (
        <label className={'alloy-theme-check' + (value === undefined ? ' inherited' : '')} title={title}>
            <input
                type='checkbox'
                checked={effective}
                disabled={disabled}
                onChange={() => onChange(value === undefined ? true : value ? false : undefined)}
            />
            {label}
            {value === undefined && <span className='alloy-theme-muted'> (inherited)</span>}
        </label>
    );
};

const Check: React.FC<{ label: string; title?: string; value: boolean; onChange: (v: boolean) => void }> = ({
    label,
    title,
    value,
    onChange,
}) => (
    <label className='alloy-theme-check' title={title}>
        <input type='checkbox' checked={value} onChange={(e) => onChange(e.target.checked)} />
        {label}
    </label>
);

// ----- editors -----

const GeneralEditor: React.FC<{ theme: VizTheme; edit: Edit }> = ({ theme, edit }) => (
    <>
        <div className='alloy-theme-title'>General Graph Settings</div>
        <Field label='Node color palette'>
            <Select<DotPalette>
                value={theme.nodePalette}
                options={DOT_PALETTES}
                onChange={(v) => v && edit((t) => (t.data.nodePalette = v))}
            />
        </Field>
        <Field label='Edge color palette'>
            <Select<DotPalette>
                value={theme.edgePalette}
                options={DOT_PALETTES}
                onChange={(v) => v && edit((t) => (t.data.edgePalette = v))}
            />
        </Field>
        <Field label='Font size'>
            <Select<number>
                value={theme.fontSize}
                options={FONT_SIZES}
                onChange={(v) => v && edit((t) => (t.data.fontSize = v))}
            />
        </Field>
        <Check
            label='Use original atom names'
            value={theme.useOriginalNames}
            onChange={(v) => edit((t) => (t.data.useOriginalNames = v))}
        />
        <Check
            label='Hide private sigs/relations'
            title='Whether the visualizer should hide private sigs, sets, and relations by default.'
            value={theme.hidePrivate}
            onChange={(v) => edit((t) => (t.data.hidePrivate = v))}
        />
        <Check
            label='Hide meta sigs/relations'
            title='Whether the visualizer should hide meta sigs, sets, and relations by default.'
            value={theme.hideMeta}
            onChange={(v) => edit((t) => (t.data.hideMeta = v))}
        />
        <Check
            label='Hide skolem sigs/relations'
            title='Whether the visualizer should hide skolem sets and relations by default.'
            value={theme.hideSkolem}
            onChange={(v) => edit((t) => (t.data.hideSkolem = v))}
        />
    </>
);

const DefaultNodeEditor: React.FC<{ theme: VizTheme; edit: Edit }> = ({ theme, edit }) => {
    const bool = (prop: InheritedProp) => theme.get(prop, null) as boolean;
    const setBool = (prop: InheritedProp) => (v: boolean) => edit((t) => t.set(prop, null, v));
    return (
        <>
            <div className='alloy-theme-title'>Default Type and Set Settings</div>
            <Field label='Color'>
                <Select
                    value={theme.get('nodeColor', null)}
                    options={DOT_COLORS}
                    onChange={(v) => v && edit((t) => t.set('nodeColor', null, v))}
                />
            </Field>
            <Field label='Shape'>
                <Select
                    value={theme.get('shape', null)}
                    options={DOT_SHAPES}
                    onChange={(v) => v && edit((t) => t.set('shape', null, v))}
                />
            </Field>
            <Field label='Style'>
                <Select
                    value={theme.get('nodeStyle', null)}
                    options={DOT_STYLES}
                    onChange={(v) => v && edit((t) => t.set('nodeStyle', null, v))}
                />
            </Field>
            <Check
                label='Show'
                title='Show members of type as nodes'
                value={bool('nodeVisible')}
                onChange={setBool('nodeVisible')}
            />
            <Check
                label='Hide unconnected nodes'
                title='Hide nodes without arcs'
                value={bool('hideUnconnected')}
                onChange={setBool('hideUnconnected')}
            />
            <Check
                label='Number nodes'
                title='Attach atom number to node label as suffix'
                value={bool('number')}
                onChange={setBool('number')}
            />
            <Check
                label='Show as labels'
                title='Show members as labels'
                value={bool('showAsLabel')}
                onChange={setBool('showAsLabel')}
            />
            <Check
                label='Show in relation attributes'
                title='Show set membership of endpoints when relation attributes are enabled'
                value={bool('showAsAttr')}
                onChange={setBool('showAsAttr')}
            />
        </>
    );
};

const EDGE_COLORS = DOT_COLORS.filter((c) => c !== 'White');

const DefaultEdgeEditor: React.FC<{ theme: VizTheme; edit: Edit }> = ({ theme, edit }) => {
    const bool = (prop: InheritedProp) => theme.get(prop, null) as boolean;
    const setBool = (prop: InheritedProp) => (v: boolean) => edit((t) => t.set(prop, null, v));
    return (
        <>
            <div className='alloy-theme-title'>Default Relation Settings</div>
            <Field label='Color'>
                <Select
                    value={theme.get('edgeColor', null)}
                    options={EDGE_COLORS}
                    onChange={(v) => v && edit((t) => t.set('edgeColor', null, v))}
                />
            </Field>
            <Field label='Style'>
                <Select
                    value={theme.get('edgeStyle', null)}
                    options={DOT_STYLES}
                    onChange={(v) => v && edit((t) => t.set('edgeStyle', null, v))}
                />
            </Field>
            <Check
                label='Show as arcs'
                title='Show relations as arcs'
                value={bool('edgeVisible')}
                onChange={setBool('edgeVisible')}
            />
            <Check
                label='Merge arrows'
                title='Merge opposing arrows of the same relation'
                value={bool('mergeArrows')}
                onChange={setBool('mergeArrows')}
            />
            <Check
                label='Influence layout'
                title='Whether this edge influences the graph layout'
                value={bool('constraint')}
                onChange={setBool('constraint')}
            />
            <Check
                label='Show as attributes'
                title='Show relations as attributes on nodes'
                value={bool('attribute')}
                onChange={setBool('attribute')}
            />
            <Check
                label='Layout backwards'
                title='Layout graph as if arcs were reversed'
                value={bool('layoutBack')}
                onChange={setBool('layoutBack')}
            />
        </>
    );
};

const LabelInput: React.FC<{ value: string; onChange: (v: string) => void; disabled?: boolean }> = ({
    value,
    onChange,
    disabled,
}) => <input type='text' value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;

const NodeEditor: React.FC<{
    el: AlloyType | AlloySet;
    theme: VizTheme;
    edit: Edit;
    originalModel: AlloyModel;
    currentModel: AlloyModel;
}> = ({ el, theme, edit, originalModel, currentModel }) => {
    const isType = el.kind === 'type';
    const enabled = !isType || currentModel.hasType(el);
    const parent = isType ? currentModel.getSuperType(el) : el.type;
    const inherit = <P extends InheritedProp>(prop: P) => theme.resolve(prop, parent, currentModel);
    const tri = (prop: InheritedProp, label: string, title: string, disabled = false) => (
        <TriState
            label={label}
            title={title}
            value={theme.get(prop, el) as boolean | undefined}
            inherited={inherit(prop) as boolean}
            disabled={!enabled || disabled}
            onChange={(v) => edit((t) => t.set(prop, el, v))}
        />
    );
    return (
        <>
            <div className='alloy-theme-title'>{isType ? typeName(el, originalModel) : el.toString()}</div>
            <Field label='Label'>
                <LabelInput
                    value={theme.label(el)}
                    disabled={!enabled || (isType && theme.useOriginalNames)}
                    onChange={(v) => edit((t) => t.setLabel(el, v))}
                />
            </Field>
            <Field label='Color'>
                <Select
                    value={theme.get('nodeColor', el)}
                    options={DOT_COLORS}
                    inherited={inherit('nodeColor')}
                    disabled={!enabled}
                    onChange={(v) => edit((t) => t.set('nodeColor', el, v))}
                />
            </Field>
            <Field label='Shape'>
                <Select
                    value={theme.get('shape', el)}
                    options={DOT_SHAPES}
                    inherited={inherit('shape')}
                    disabled={!enabled}
                    onChange={(v) => edit((t) => t.set('shape', el, v))}
                />
            </Field>
            <Field label='Style'>
                <Select
                    value={theme.get('nodeStyle', el)}
                    options={DOT_STYLES}
                    inherited={inherit('nodeStyle')}
                    disabled={!enabled}
                    onChange={(v) => edit((t) => t.set('nodeStyle', el, v))}
                />
            </Field>
            {tri('nodeVisible', 'Show', isType ? 'Display members as nodes' : 'Include members of set as nodes')}
            {!isType && tri('showAsAttr', 'Show in relation attributes', 'Show set membership in relation attributes')}
            {!isType && tri('showAsLabel', 'Show as labels', 'Show membership in set by labeling nodes')}
            {tri('hideUnconnected', 'Hide unconnected nodes', 'Hide nodes without arcs')}
            {isType &&
                tri('number', 'Number nodes', 'Attach atom number to node label as suffix', theme.useOriginalNames)}
            {isType && VizTheme.canProject(el, originalModel) && (
                <Check
                    label='Project over this sig'
                    title='Show one graph per atom of this sig'
                    value={theme.projected.includes(el.name)}
                    onChange={(v) => edit((t) => (v ? t.project(el.name) : t.deproject(el.name)))}
                />
            )}
        </>
    );
};

const EdgeEditor: React.FC<{ rel: AlloyRelation; theme: VizTheme; edit: Edit; currentModel: AlloyModel }> = ({
    rel,
    theme,
    edit,
    currentModel,
}) => {
    const inherit = <P extends InheritedProp>(prop: P) => theme.resolve(prop, null, currentModel);
    const tri = (prop: InheritedProp, label: string, title: string) => (
        <TriState
            label={label}
            title={title}
            value={theme.get(prop, rel) as boolean | undefined}
            inherited={inherit(prop) as boolean}
            onChange={(v) => edit((t) => t.set(prop, rel, v))}
        />
    );
    return (
        <>
            <div className='alloy-theme-title'>{rel.toString()}</div>
            <Field label='Label'>
                <LabelInput value={theme.label(rel)} onChange={(v) => edit((t) => t.setLabel(rel, v))} />
            </Field>
            <Field label='Weight'>
                <input
                    type='number'
                    min={0}
                    max={999}
                    value={theme.weight(rel)}
                    title='A higher weight will cause the edge to be shorter and straighter.'
                    onChange={(e) => edit((t) => t.setWeight(rel, Number(e.target.value)))}
                />
            </Field>
            <Field label='Color'>
                <Select
                    value={theme.get('edgeColor', rel)}
                    options={EDGE_COLORS}
                    inherited={inherit('edgeColor')}
                    onChange={(v) => edit((t) => t.set('edgeColor', rel, v))}
                />
            </Field>
            <Field label='Style'>
                <Select
                    value={theme.get('edgeStyle', rel)}
                    options={DOT_STYLES}
                    inherited={inherit('edgeStyle')}
                    onChange={(v) => edit((t) => t.set('edgeStyle', rel, v))}
                />
            </Field>
            {tri('edgeVisible', 'Show as arcs', 'Show relation as arcs')}
            {tri(
                'attribute',
                'Show as attribute',
                "Additionally display this relation as an attribute on the nodes' labels"
            )}
            {tri('layoutBack', 'Layout backwards', 'Layout graph as if arcs were reversed')}
            {tri(
                'mergeArrows',
                'Merge arrows',
                'Merge opposing arrows between the same nodes as one bidirectional arrow'
            )}
            {tri('constraint', 'Influence layout', 'Whether this edge influences the graph layout')}
        </>
    );
};

export default ThemeEditor;
