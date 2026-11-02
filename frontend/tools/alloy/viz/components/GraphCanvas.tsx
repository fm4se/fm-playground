/**
 * Renders a laid-out Alloy graph as SVG, with Alloy's interactions: hovering a
 * node, an edge or a legend entry highlights it, nodes can be dragged (keeping
 * the layered layout), plus pan/zoom, a context menu and export.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GraphContextMenu, { ContextMenuItem } from '../../components/graph/GraphContextMenu';
import { ContextMenuState } from '../../components/graph/types';
import { Graph, GraphEdge, GraphNode, NodeGeometry } from '../core/graph/graph';
import { GRAPH_FONT_FAMILY, GRAPH_FONT_SIZE } from '../core/graph/textMetrics';
import { DotStyle } from '../core/dot';
import { AtomNodeData, TupleEdgeData } from '../core/graphMaker';
import { exportPng, exportSvg } from './exportGraph';

const LIGHT_GRAY = '#c0c0c0';
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

type Highlight =
    | { kind: 'node'; node: GraphNode }
    | { kind: 'edge'; edge: GraphEdge }
    | { kind: 'group'; group: string }
    | null;

interface View {
    scale: number;
    tx: number;
    ty: number;
}

/** Extra context-menu entries supplied by the owner (e.g. theme shortcuts). */
export interface CanvasMenuProvider {
    node?: (node: GraphNode) => ContextMenuItem[];
    edge?: (edge: GraphEdge) => ContextMenuItem[];
}

interface GraphCanvasProps {
    graph: Graph;
    /** Shown in the top-right corner (e.g. the trace state). */
    caption?: string;
    menu?: CanvasMenuProvider;
    exportName?: string;
}

const strokeWidth = (style: DotStyle, scale: number) => (style === 'Bold' ? 2.6 : 1.3) / Math.max(1, scale);

const dashArray = (style: DotStyle) => (style === 'Dotted' ? '1 3' : style === 'Dashed' ? '6 3' : undefined);

/** Alloy draws labels in white on black, red and blue nodes. */
const textColorFor = (fill: string) =>
    ['#000000', '#ff0000', '#0000ff'].includes(fill.toLowerCase()) ? '#ffffff' : '#000000';

const closedMenu: ContextMenuState = {
    visible: false,
    x: 0,
    y: 0,
    targetType: 'canvas',
    targetId: null,
    targetLabel: null,
    targetRelationship: null,
    targetNodeType: null,
};

const GraphCanvas: React.FC<GraphCanvasProps> = ({ graph, caption, menu, exportName = 'alloy-instance' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
    /** True until the user pans or zooms; then graph changes keep the view. */
    const autoFit = useRef(true);
    const [highlight, setHighlight] = useState<Highlight>(null);
    const [, setTick] = useState(0);
    const drag = useRef<
        | { kind: 'node'; node: GraphNode; mouseX: number; mouseY: number; x: number; y: number; moved: boolean }
        | { kind: 'pan'; mouseX: number; mouseY: number; tx: number; ty: number }
        | null
    >(null);
    const [menuState, setMenuState] = useState<ContextMenuState>(closedMenu);
    const [menuItems, setMenuItems] = useState<ContextMenuItem[]>([]);

    const fitView = useCallback((): View | null => {
        if (size.width <= 0 || size.height <= 0) return null;
        const b = graph.bounds();
        const scale = Math.max(
            MIN_SCALE,
            Math.min(graph.defaultScale, (size.width - 8) / b.width, (size.height - 8) / b.height)
        );
        return {
            scale,
            tx: (size.width - b.width * scale) / 2 - b.x * scale,
            ty: Math.max(4, (size.height - b.height * scale) / 2) - b.y * scale,
        };
    }, [graph, size]);

    const zoomToFit = useCallback(() => {
        autoFit.current = true;
        const v = fitView();
        if (v) setView(v);
    }, [fitView]);

    // Track the container size.
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Fit new graphs (and resizes) until the user takes control of the view.
    useEffect(() => {
        setHighlight(null);
        if (autoFit.current) {
            const v = fitView();
            if (v) setView(v);
        }
    }, [fitView]);

    const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
        autoFit.current = false;
        setView((v) => {
            const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
            const k = scale / v.scale;
            return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
        });
    }, []);

    // Wheel zoom needs a non-passive listener to keep the page from scrolling.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            zoomAt(Math.pow(1.0015, -e.deltaY), e.clientX - rect.left, e.clientY - rect.top);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [zoomAt]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const d = drag.current;
            if (!d) return;
            if (d.kind === 'pan') {
                autoFit.current = false;
                setView((v) => ({ ...v, tx: d.tx + e.clientX - d.mouseX, ty: d.ty + e.clientY - d.mouseY }));
            } else {
                const dx = e.clientX - d.mouseX;
                const dy = e.clientY - d.mouseY;
                if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
                d.moved = true;
                d.node.tweak(d.x + dx / view.scale, d.y + dy / view.scale);
                setTick((t) => t + 1);
            }
        };
        const onUp = () => {
            drag.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [view.scale]);

    const openMenu = (e: React.MouseEvent, items: ContextMenuItem[]) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuItems(items);
        setMenuState({
            ...closedMenu,
            visible: true,
            x: Math.min(e.clientX, window.innerWidth - 240),
            y: Math.min(e.clientY, window.innerHeight - 40 * (items.length + 1)),
        });
    };

    const viewItems = (): ContextMenuItem[] => {
        const cx = size.width / 2;
        const cy = size.height / 2;
        return [
            { label: 'Zoom In', icon: '+', onClick: () => zoomAt(1.33, cx, cy) },
            { label: 'Zoom Out', icon: '−', onClick: () => zoomAt(1 / 1.33, cx, cy) },
            { label: 'Zoom to Fit', icon: '⤢', onClick: zoomToFit },
            { label: '', onClick: () => {}, divider: true },
            {
                label: 'Export as SVG',
                icon: '⇩',
                onClick: () => svgRef.current && exportSvg(svgRef.current, graph, `${exportName}.svg`),
            },
            {
                label: 'Export as PNG',
                icon: '⇩',
                onClick: () => svgRef.current && exportPng(svgRef.current, graph, `${exportName}.png`),
            },
        ];
    };

    /** Edges starting at real nodes, i.e. one per drawn arrow, with a stable index for keys. */
    const firstSegments = useMemo(() => {
        const list: GraphEdge[] = [];
        for (const n of graph.nodes) if (n.shape !== null) list.push(...n.outs, ...n.selfs);
        return list;
    }, [graph]);
    const edgeIndex = useMemo(() => new Map(firstSegments.map((e, i) => [e, i])), [firstSegments]);

    // ---- what to highlight (Graph.draw) ----
    let highEdge: GraphEdge | null = null;
    let highGroup: string | null = null;
    let highNodes: GraphNode[] = [];
    if (highlight?.kind === 'edge') {
        const chain = highlight.edge.a === highlight.edge.b ? [highlight.edge] : highlight.edge.chain();
        highEdge = chain[0];
        highGroup = highEdge.group;
        highNodes = [chain[0].a, chain[chain.length - 1].b];
    } else if (highlight?.kind === 'group') {
        highGroup = highlight.group;
    } else if (highlight?.kind === 'node') {
        highNodes = [highlight.node];
    }
    const ascent = graph.metrics.ascent;
    const ad = graph.lineHeight;

    const renderEdge = (e: GraphEdge) => {
        const isHigh = e === highEdge;
        const active = isHigh || (!highEdge && !highGroup) || highGroup === e.group;
        const color = active ? e.color : LIGHT_GRAY;
        const style: DotStyle = isHigh ? 'Bold' : e.style;
        const d = e.svgPath();
        const data = e.data as TupleEdgeData | undefined;
        return (
            <g
                key={`e-${edgeIndex.get(e)}`}
                onMouseEnter={() => !drag.current && setHighlight({ kind: 'edge', edge: e })}
                onMouseLeave={() => !drag.current && setHighlight(null)}
                onContextMenu={(ev) =>
                    openMenu(ev, [
                        ...(menu?.edge?.(e) ?? []),
                        { label: '', onClick: () => {}, divider: true },
                        ...viewItems(),
                    ])
                }
                style={{ cursor: 'pointer' }}
            >
                {data && (
                    <title>{`${data.relation.name}: ${data.tuple.atoms.map((a) => a.originalName).join(' -> ')}`}</title>
                )}
                <path d={d} fill='none' stroke='transparent' strokeWidth={12 / view.scale} data-export='skip' />
                <path
                    d={d}
                    fill='none'
                    stroke={color}
                    strokeWidth={strokeWidth(style, view.scale)}
                    strokeDasharray={dashArray(style)}
                    strokeDashoffset={style === 'Dashed' ? 5 : undefined}
                    strokeLinecap={style === 'Dotted' || style === 'Dashed' ? 'round' : undefined}
                />
                {e.arrowHeads(isHigh).map((pts, i) => (
                    <polygon
                        key={i}
                        points={pts.map((p) => p.join(',')).join(' ')}
                        fill={color}
                        stroke={color}
                        strokeWidth={strokeWidth(style, view.scale)}
                    />
                ))}
                {!highEdge && !highGroup && e.label && (
                    <text x={e.labelX} y={e.labelY + ascent} fill={e.color}>
                        {e.label}
                    </text>
                )}
            </g>
        );
    };

    const renderNode = (n: GraphNode) => {
        const geom = n.geometry;
        if (!geom) return null;
        const isHigh = highNodes.includes(n);
        const fill = isHigh ? LIGHT_GRAY : n.color;
        const sw = strokeWidth(n.style, view.scale);
        const outlineStyle = { stroke: '#000000', strokeWidth: sw, strokeDasharray: dashArray(n.style) };
        const solid = {
            stroke: '#000000',
            strokeWidth: strokeWidth(n.style === 'Bold' ? 'Bold' : 'Solid', view.scale),
        };
        const lines = n.textLines;
        const y0 = n.labelShift + Math.trunc((-lines.length * ad) / 2);
        const data = n.data as AtomNodeData | undefined;
        return (
            <g
                key={`n-${n.pos}`}
                transform={`translate(${n.x},${n.y})`}
                onMouseEnter={() => !drag.current && setHighlight({ kind: 'node', node: n })}
                onMouseLeave={() => !drag.current && setHighlight(null)}
                onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    drag.current = {
                        kind: 'node',
                        node: n,
                        mouseX: e.clientX,
                        mouseY: e.clientY,
                        x: n.x,
                        y: n.y,
                        moved: false,
                    };
                }}
                onContextMenu={(ev) =>
                    openMenu(ev, [
                        ...(menu?.node?.(n) ?? []),
                        { label: '', onClick: () => {}, divider: true },
                        ...viewItems(),
                    ])
                }
                style={{ cursor: 'move' }}
            >
                {data && <title>{data.atom.originalName}</title>}
                {renderShape(geom, fill, outlineStyle, solid)}
                {lines.map((t, i) => (
                    <text
                        key={i}
                        x={0}
                        y={y0 + i * ad + ascent}
                        textAnchor='middle'
                        fill={textColorFor(n.color)}
                        fontWeight={n.fontBold ? 'bold' : undefined}
                    >
                        {t}
                    </text>
                ))}
            </g>
        );
    };

    // Draw order as in Alloy: other edges, edges of the highlighted group, the highlighted edge, then nodes.
    const others = firstSegments.filter((e) => e.group !== highGroup);
    const grouped = firstSegments.filter((e) => e.group === highGroup && e !== highEdge);
    const plainNodes = graph.nodes.filter((n) => n.shape !== null && !highNodes.includes(n));
    const legends = graph.legends.filter((l) => l.color !== null);

    return (
        <div
            ref={containerRef}
            className='alloy-viz-canvas'
            onMouseDown={(e) => {
                if (e.button !== 0) return;
                drag.current = { kind: 'pan', mouseX: e.clientX, mouseY: e.clientY, tx: view.tx, ty: view.ty };
            }}
            onDoubleClick={zoomToFit}
            onContextMenu={(e) => openMenu(e, viewItems())}
        >
            <svg ref={svgRef} width='100%' height='100%' fontFamily={GRAPH_FONT_FAMILY} fontSize={GRAPH_FONT_SIZE}>
                <g data-role='graph' transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
                    {others.map(renderEdge)}
                    {grouped.map(renderEdge)}
                    {highEdge && renderEdge(highEdge)}
                    {plainNodes.map(renderNode)}
                    {highNodes.map(renderNode)}
                    {highEdge && highEdge.label && highEdge.a !== highEdge.b && (
                        <g pointerEvents='none'>
                            <rect
                                x={highEdge.labelX}
                                y={highEdge.labelY}
                                width={highEdge.labelW}
                                height={highEdge.labelH}
                                fill='rgba(255,255,255,0.63)'
                            />
                            <text x={highEdge.labelX} y={highEdge.labelY + ascent} fill={highEdge.color}>
                                {highEdge.label}
                            </text>
                        </g>
                    )}
                    {highEdge && highEdge.label && highEdge.a === highEdge.b && (
                        <text
                            x={highEdge.labelX}
                            y={highEdge.labelY + ascent}
                            fill={highEdge.color}
                            pointerEvents='none'
                        >
                            {highEdge.label}
                        </text>
                    )}
                </g>
            </svg>
            {legends.length > 0 && (
                <div className='alloy-viz-legend' onMouseDown={(e) => e.stopPropagation()}>
                    {legends.map((l) => {
                        const groupActive = highGroup !== null && legends.some((x) => x.group === highGroup);
                        const isActive = !groupActive || l.group === highGroup;
                        return (
                            <div
                                key={l.group}
                                onMouseEnter={() => setHighlight({ kind: 'group', group: l.group })}
                                onMouseLeave={() => setHighlight(null)}
                                style={{
                                    color: isActive ? l.color! : '#808080',
                                    fontWeight: groupActive && l.group === highGroup ? 'bold' : undefined,
                                }}
                            >
                                {l.label}
                            </div>
                        );
                    })}
                </div>
            )}
            {caption && <div className='alloy-viz-caption'>{caption}</div>}
            <GraphContextMenu state={menuState} onClose={() => setMenuState(closedMenu)} items={menuItems} />
        </div>
    );
};

function renderShape(
    geom: NodeGeometry,
    fill: string,
    outline: { stroke: string; strokeWidth: number; strokeDasharray?: string },
    solid: { stroke: string; strokeWidth: number }
) {
    if (geom.kind === 'path') return <path d={geom.d} fill={fill} {...outline} />;
    if (geom.kind === 'circle')
        return (
            <>
                <circle r={geom.radius} fill={fill} {...outline} />
                {geom.innerRadius !== undefined && <circle r={geom.innerRadius} fill='none' {...outline} />}
                {geom.lines.map(([x1, y1, x2, y2], i) => (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...solid} />
                ))}
            </>
        );
    const pts = (p: [number, number][]) => p.map((q) => q.join(',')).join(' ');
    return (
        <>
            <polygon points={pts(geom.outline)} fill={fill} {...outline} />
            {geom.extraOutlines.map((o, i) => (
                <polygon key={i} points={pts(o)} fill='none' {...outline} />
            ))}
            {geom.lines.map(([x1, y1, x2, y2], i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...solid} />
            ))}
        </>
    );
}

export default GraphCanvas;
