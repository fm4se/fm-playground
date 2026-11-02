/**
 * The Alloy instance visualizer: Alloy Analyzer's graph view with themes,
 * Magic Layout, projection and trace navigation, for one Alloy API response.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlloyAtom, AlloyType } from '../core/model';
import { AlloyTrace, normalizeState, readAlloyTrace } from '../core/reader';
import { VizTheme } from '../core/theme';
import { magicTheme } from '../core/magic';
import { makeGraph, AtomNodeData, TupleEdgeData } from '../core/graphMaker';
import { Graph } from '../core/graph/graph';
import { getTextMetrics } from '../core/graph/textMetrics';
import { parseThemeXml, themeToXml } from '../core/themeXml';
import GraphCanvas, { CanvasMenuProvider } from './GraphCanvas';
import ThemeEditor, { ThemeSelection } from './ThemeEditor';
import TraceTimeline from './TraceTimeline';
import ProjectionBar, { ProjectionChoice } from './ProjectionBar';
import { useVizTheme } from './useVizTheme';
import { download } from './exportGraph';
import './AlloyVisualizer.css';

interface AlloyVisualizerProps {
    /** The Alloy API instance response (solution XML as JSON). */
    response: unknown;
    height: string;
    /** Position on the trace (may run past its end; it then loops). Controlled if given. */
    position?: number;
    onPositionChange?: (position: number) => void;
}

const PANES_KEY = 'alloy-viz-trace-panes';

function loadPanes(): number {
    try {
        return localStorage.getItem(PANES_KEY) === '1' ? 1 : 2;
    } catch {
        return 2;
    }
}

const AlloyVisualizer: React.FC<AlloyVisualizerProps> = ({ response, height, position, onPositionChange }) => {
    const parsed = useMemo((): { trace: AlloyTrace | null; error: string | null } => {
        try {
            return { trace: readAlloyTrace(response as Record<string, unknown>), error: null };
        } catch (e) {
            return { trace: null, error: e instanceof Error ? e.message : String(e) };
        }
    }, [response]);
    const trace = parsed.trace;
    const originalModel = trace?.states[0].model ?? null;
    const [theme, setTheme] = useVizTheme(originalModel);

    const [ownPosition, setOwnPosition] = useState(0);
    const pos = position ?? ownPosition;
    const setPos = (p: number) => {
        const next = Math.max(0, p);
        if (onPositionChange) onPositionChange(next);
        if (position === undefined) setOwnPosition(next);
    };
    useEffect(() => setOwnPosition(0), [response]);

    const [panesPref, setPanesPref] = useState(loadPanes);
    const panes = trace?.isTemporal ? panesPref : 1;
    const [showTheme, setShowTheme] = useState(false);
    const [selection, setSelection] = useState<ThemeSelection>('general');
    const [showProjectionMenu, setShowProjectionMenu] = useState(false);
    /** Chosen atom (by key) per projected type. */
    const [projectionAtoms, setProjectionAtoms] = useState<Record<string, string>>({});

    const states = trace
        ? Array.from({ length: panes }, (_, i) => normalizeState(pos + i, trace.traceLength, trace.loopState))
        : [];

    // Projection: the chosen atom of each projected (toplevel, non-var) type.
    const projectedTypes: AlloyType[] = originalModel
        ? theme.projected
              .map((n) => originalModel.findType(n))
              .filter((t): t is AlloyType => !!t && VizTheme.canProject(t, originalModel))
        : [];
    const lastState = trace ? trace.states[states[states.length - 1]] : null;
    const choices: ProjectionChoice[] = lastState
        ? projectedTypes.map((type) => {
              const atoms = lastState.type2atoms(type);
              const i = atoms.findIndex((a) => a.key === projectionAtoms[type.name]);
              return {
                  typeName: type.name,
                  atoms,
                  names: atoms.map((a) => theme.atomName(a, true)),
                  selected: Math.max(0, i),
              };
          })
        : [];
    const projectionKey = choices.map((c) => `${c.typeName}=${c.atoms[c.selected]?.key ?? ''}`).join('|');

    // Graphs are cached per state and projection so that dragged nodes stay put while navigating.
    const graphCache = useMemo(() => new Map<string, Graph>(), [trace, theme]);
    const graphs = states.map((s) => {
        const key = `${s}|${projectionKey}`;
        let g = graphCache.get(key);
        if (!g && trace) {
            const projection = new Map(choices.map((c) => [c.typeName, c.atoms[c.selected] ?? null]));
            g = makeGraph(trace.states[s], theme, { metrics: getTextMetrics(), projection });
            graphCache.set(key, g);
        }
        return g!;
    });

    const runMagicLayout = () => {
        if (!originalModel) return;
        if (window.confirm('This will clear your original customizations. Are you sure?'))
            setTheme(magicTheme(originalModel));
    };

    const projectableTypes = originalModel
        ? originalModel.types.filter((t) => VizTheme.canProject(t, originalModel))
        : [];
    const toggleProjection = (type: AlloyType) =>
        setTheme(
            theme.with((t) => (theme.projected.includes(type.name) ? t.deproject(type.name) : t.project(type.name)))
        );
    const projectionLabel =
        projectedTypes.length === 0
            ? 'Projection: none'
            : projectedTypes.length === 1
              ? `Projected over ${projectedTypes[0].name}`
              : `Projected over ${projectedTypes.length} sigs`;

    const editElement = (key: string) => {
        setSelection(key);
        setShowTheme(true);
    };

    const menu: CanvasMenuProvider = {
        node: (node) => {
            const atom = (node.data as AtomNodeData | undefined)?.atom;
            if (!atom || !originalModel) return [];
            const type = atom.type;
            const items = [
                { label: `Customize sig ${type.name}…`, icon: '⚙', onClick: () => editElement(type.key) },
                {
                    label: `Hide sig ${type.name}`,
                    icon: '◌',
                    onClick: () => setTheme(theme.with((t) => t.set('nodeVisible', type, false))),
                },
            ];
            const top = originalModel.getTopmostSuperType(type);
            if (top && VizTheme.canProject(top, originalModel) && !theme.projected.includes(top.name))
                items.push({ label: `Project over ${top.name}`, icon: '⊞', onClick: () => toggleProjection(top) });
            return items;
        },
        edge: (edge) => {
            const rel = (edge.data as TupleEdgeData | undefined)?.relation;
            if (!rel) return [];
            return [
                { label: `Customize relation ${rel.name}…`, icon: '⚙', onClick: () => editElement(rel.key) },
                {
                    label: `Hide relation ${rel.name}`,
                    icon: '◌',
                    onClick: () => setTheme(theme.with((t) => t.set('edgeVisible', rel, false))),
                },
                {
                    label: `Show ${rel.name} as attribute`,
                    icon: '≡',
                    onClick: () =>
                        setTheme(
                            theme.with((t) => {
                                t.set('attribute', rel, true);
                                t.set('edgeVisible', rel, false);
                            })
                        ),
                },
            ];
        },
    };

    const toolbarRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!showProjectionMenu) return;
        const close = (e: MouseEvent) => {
            if (!toolbarRef.current?.contains(e.target as Node)) setShowProjectionMenu(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [showProjectionMenu]);

    if (!trace || !originalModel) {
        return (
            <div className='alloy-viz plain-alloy-message-box' style={{ height }}>
                {parsed.error ?? 'No instance to visualize.'}
            </div>
        );
    }

    const caption = (i: number) => (trace.isTemporal ? `State ${states[i]}` : undefined);

    return (
        <div className='alloy-viz' style={{ height }}>
            <div className='alloy-viz-toolbar' ref={toolbarRef}>
                <button
                    className={showTheme ? 'active' : ''}
                    onClick={() => setShowTheme((s) => !s)}
                    title='Customize the theme: colors, shapes, labels, visibility'
                >
                    ⚙ Theme
                </button>
                <button onClick={runMagicLayout} title='Automatic theme customization (will reset current theme)'>
                    ✦ Magic Layout
                </button>
                <div className='alloy-viz-dropdown'>
                    <button
                        disabled={projectableTypes.length === 0}
                        onClick={() => setShowProjectionMenu((s) => !s)}
                        title='Project the instance over a signature (e.g. Time or State)'
                    >
                        {projectionLabel} ▾
                    </button>
                    {showProjectionMenu && (
                        <div className='alloy-viz-dropdown-menu'>
                            {projectableTypes.map((t) => (
                                <div
                                    key={t.name}
                                    className='alloy-viz-dropdown-item'
                                    onClick={() => toggleProjection(t)}
                                >
                                    <span className='alloy-viz-check'>
                                        {theme.projected.includes(t.name) ? '✓' : ''}
                                    </span>
                                    {t.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <span className='alloy-viz-spacer' />
                {trace.isTemporal && (
                    <>
                        <button onClick={() => setPos(pos - 1)} disabled={pos === 0} title='Previous state'>
                            {pos > 0 ? '←' : '⇤'}
                        </button>
                        <button onClick={() => setPos(pos + 1)} title='Next state'>
                            →
                        </button>
                        <button
                            onClick={() => {
                                const next = panesPref === 1 ? 2 : 1;
                                setPanesPref(next);
                                try {
                                    localStorage.setItem(PANES_KEY, String(next));
                                } catch {
                                    // ignore
                                }
                            }}
                            title={panesPref === 1 ? 'Show the next state side by side' : 'Show only the current state'}
                        >
                            {panesPref === 1 ? '◫ 2 states' : '▢ 1 state'}
                        </button>
                    </>
                )}
                <span
                    className='alloy-viz-help'
                    title='Drag nodes to move them · drag the background to pan · scroll to zoom · double-click to fit · right-click for zoom, export and quick theme options · hover a legend entry to highlight a relation'
                >
                    ?
                </span>
            </div>
            {trace.isTemporal && (
                <TraceTimeline
                    position={pos}
                    panes={panes}
                    traceLength={trace.traceLength}
                    loopState={trace.loopState}
                    onSelect={setPos}
                />
            )}
            <div className='alloy-viz-body'>
                {showTheme && (
                    <ThemeEditor
                        theme={theme}
                        originalModel={originalModel}
                        selection={selection}
                        onSelect={setSelection}
                        onChange={setTheme}
                        onMagicLayout={runMagicLayout}
                        onReset={() => {
                            if (window.confirm('Reset the theme to the default settings?'))
                                setTheme(VizTheme.createDefault(originalModel));
                        }}
                        onLoadThm={(text) => {
                            try {
                                setTheme(parseThemeXml(text, originalModel));
                            } catch (e) {
                                window.alert(e instanceof Error ? e.message : String(e));
                            }
                        }}
                        onSaveThm={() =>
                            download(
                                'alloy-theme.thm',
                                new Blob([themeToXml(theme, originalModel)], { type: 'application/xml' })
                            )
                        }
                        onClose={() => setShowTheme(false)}
                    />
                )}
                <div className='alloy-viz-panes'>
                    {graphs.map((g, i) => (
                        <GraphCanvas
                            key={i}
                            graph={g}
                            caption={caption(i)}
                            menu={menu}
                            exportName={trace.isTemporal ? `alloy-state-${states[i]}` : 'alloy-instance'}
                        />
                    ))}
                </div>
            </div>
            <ProjectionBar
                choices={choices}
                onSelect={(typeName: string, atom: AlloyAtom) =>
                    setProjectionAtoms((p) => ({ ...p, [typeName]: atom.key }))
                }
            />
        </div>
    );
};

export default AlloyVisualizer;
