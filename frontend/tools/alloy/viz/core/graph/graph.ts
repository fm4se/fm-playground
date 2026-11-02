/**
 * Alloy's graph layout engine: a layered (Sugiyama-style) layout with Alloy's
 * node shapes, curved edges and label placement.
 *
 * Port of edu.mit.csail.sdg.alloy4graph.{Graph, GraphNode, GraphEdge}. Coordinates
 * are integers as in the original, so `int()`/`idiv()` mirror Java's int casts
 * and integer division; keep them when changing arithmetic, or layouts drift.
 */
import { Curve } from './curve';
import { AvailableSpace } from './availableSpace';
import { TextMetrics } from './textMetrics';
import { DotShape, DotStyle } from '../dot';

const X_JUMP = 30;
const Y_JUMP = 60;
const SELF_LOOP_A = 40;
const SELF_LOOP_GL = 2;
const SELF_LOOP_GR = 20;
const DUMMY_WIDTH = 30;
const DUMMY_HEIGHT = 10;
const LABEL_PADDING = 5;

const SQRT3 = 1.7320508075688772;
const SIN36 = 0.5877852522924731;
const COS36 = 0.8090169943749475;
const COS18 = 0.9510565162951535;
const TAN18 = 0.3249196962329063;

/** Java's (int) cast of a double. */
function int(x: number): number {
    if (Number.isNaN(x)) return 0;
    if (x >= 2147483647) return 2147483647;
    if (x <= -2147483648) return -2147483648;
    return Math.trunc(x);
}

/** Java's integer division. */
const idiv = (a: number, b: number) => Math.trunc(a / b);

export type Point = [number, number];

/** What to draw for a node, in coordinates relative to the node's center. */
export type NodeGeometry =
    | { kind: 'polygon'; outline: Point[]; extraOutlines: Point[][]; lines: [number, number, number, number][] }
    | { kind: 'path'; d: string }
    | { kind: 'circle'; radius: number; innerRadius?: number; lines: [number, number, number, number][] };

export interface Legend {
    /** Edge group (relation key) this legend entry stands for. */
    group: string;
    label: string;
    /** Null means the relation has no visible edges. */
    color: string | null;
}

export class Graph {
    readonly nodes: GraphNode[] = [];
    readonly edges: GraphEdge[] = [];
    readonly layers: GraphNode[][] = [];
    readonly legends: Legend[] = [];
    layerHeights: number[] = [];

    constructor(
        readonly metrics: TextMetrics,
        /** Initial zoom (font size / 12). */
        readonly defaultScale = 1
    ) {}

    get lineHeight() {
        return this.metrics.lineHeight;
    }

    /** Real (non-dummy) nodes. */
    get realNodes(): GraphNode[] {
        return this.nodes.filter((n) => n.shape !== null);
    }

    addLegend(group: string, label: string, color: string | null) {
        this.legends.push({ group, label, color });
    }

    layer(i: number): GraphNode[] {
        return i >= 0 && i < this.layers.length ? this.layers[i] : [];
    }

    private sortNodes(newOrder: GraphNode[]) {
        const rest = this.nodes.filter((n) => !newOrder.includes(n));
        const ordered = [...newOrder.filter((n) => this.nodes.includes(n)), ...rest];
        this.nodes.splice(0, this.nodes.length, ...ordered);
        this.nodes.forEach((n, i) => (n.pos = i));
    }

    /** Orders nodes to minimize back edges: Eades-Lin-Smyth's GR heuristic for feedback arc set. */
    private assignOrder() {
        const num = this.nodes.length;
        const bins: GraphNode[][] = Array.from({ length: 2 * num + 1 }, () => []);
        const grIn: GraphNode[][] = [];
        const grOut: GraphNode[][] = [];
        const grBin: number[] = new Array(num).fill(0);
        const binOf = (ins: number, outs: number) => (outs === 0 ? 0 : ins === 0 ? 2 * num : outs - ins + num);
        for (const n of this.nodes) {
            const ins: GraphNode[] = [];
            const outs: GraphNode[] = [];
            for (const e of n.ins) if (!ins.includes(e.a)) ins.push(e.a);
            for (const e of n.outs) if (!outs.includes(e.b)) outs.push(e.b);
            grIn.push(ins);
            grOut.push(outs);
            grBin[n.pos] = binOf(ins.length, outs.length);
            bins[grBin[n.pos]].push(n);
        }
        const s1: GraphNode[] = [];
        const s2: GraphNode[] = [];
        const removeFrom = (list: GraphNode[], x: GraphNode) => {
            const i = list.indexOf(x);
            if (i >= 0) list.splice(i, 1);
        };
        for (;;) {
            let x: GraphNode | null = null;
            if (bins[0].length > 0) {
                x = bins[0].pop()!;
                s1.push(x);
            } else {
                for (let j = 2 * num; j > 0; j--) {
                    if (bins[j].length > 0) {
                        x = bins[j].pop()!;
                        s2.unshift(x);
                        break;
                    }
                }
            }
            if (!x) break;
            removeFrom(bins[grBin[x.pos]], x);
            for (const n of grIn[x.pos]) removeFrom(grOut[n.pos], x);
            for (const n of grOut[x.pos]) removeFrom(grIn[n.pos], x);
            // Alloy sorts neighbors by name so nodes end up lexicographically ordered within layers.
            const aux = [...grIn[x.pos], ...grOut[x.pos]].sort((o1, o2) =>
                o1.uuid < o2.uuid ? 1 : o1.uuid > o2.uuid ? -1 : 0
            );
            for (const n of aux) {
                const b = binOf(grIn[n.pos].length, grOut[n.pos].length);
                if (grBin[n.pos] !== b) {
                    removeFrom(bins[grBin[n.pos]], n);
                    grBin[n.pos] = b;
                    bins[b].push(n);
                }
            }
        }
        this.sortNodes([...s1, ...s2]);
    }

    /** Reverses edges so that every edge goes from a higher to a lower position. */
    private backEdges() {
        for (const e of this.edges)
            if (e.a.pos < e.b.pos) {
                e.setHeads(e.bhead, e.ahead);
                e.reverse();
            }
    }

    /** Puts every node on the layer of its longest path to a sink; returns the number of layers. */
    private decideLayer(): number {
        const len: number[] = new Array(this.nodes.length).fill(0);
        for (const x of this.nodes) {
            let max = 0;
            for (const e of x.outs) max = Math.max(max, len[e.b.pos] + 1);
            len[x.pos] = max;
        }
        for (const x of this.nodes) x.setLayer(len[x.pos]);
        // Whenever all of X's incoming edges come from more than one layer above, move X up.
        for (let changed = true; changed; ) {
            changed = false;
            for (const x of this.nodes) {
                if (x.ins.length === 0) continue;
                let closest = this.layers.length + 1;
                for (const e of x.ins) closest = Math.min(closest, e.a.layer);
                if (closest - 1 > x.layer) {
                    x.setLayer(closest - 1);
                    changed = true;
                }
            }
        }
        return this.layers.length;
    }

    /** Splits edges spanning several layers by inserting invisible dummy nodes. */
    private dummyNodesIfNeeded() {
        for (const edge of [...this.edges]) {
            let e = edge;
            let a = e.a;
            const b = e.b;
            while (a.layer - b.layer > 1) {
                const tmp = a;
                a = new GraphNode(this, e.uuid);
                a.setShape(null);
                a.setLayer(tmp.layer - 1);
                e.change(a);
                e = new GraphEdge(a, b, e.uuid, '', e.group, {
                    ahead: e.ahead,
                    bhead: e.bhead,
                    style: e.style,
                    color: e.color,
                    data: e.data,
                });
            }
        }
    }

    /** Orders each layer by the barycenter of its successors. */
    private reorderPerLayer() {
        const bc: number[] = new Array(this.nodes.length + 1).fill(0);
        this.layer(0).forEach((n, i) => (bc[n.pos] = i + 1));
        for (let layer = 0; layer < this.layers.length - 1; layer++) {
            for (const n of this.layer(layer + 1)) {
                const seen = new Set<GraphNode>();
                let sum = 0;
                for (const e of n.outs)
                    if (!seen.has(e.b)) {
                        seen.add(e.b);
                        sum += bc[e.b.pos];
                    }
                bc[n.pos] = seen.size === 0 ? 0 : sum / seen.size;
            }
            this.layers[layer + 1].sort((o1, o2) => {
                if (o1 === o2) return 0;
                if (bc[o1.pos] !== bc[o2.pos]) return bc[o1.pos] < bc[o2.pos] ? -1 : 1;
                return o1.pos < o2.pos ? -1 : 1;
            });
            this.layer(layer + 1).forEach((n, i) => (bc[n.pos] = i + 1));
        }
    }

    /** Assigns x within one layer (Marriott et al., "Layout of Bayesian Networks"). */
    private xAssignment(nodes: GraphNode[]) {
        const n = nodes.length;
        if (n === 0) return;
        const block: Block[] = new Array(n + 1);
        block[0] = SENTINEL;
        for (let i = 1; i <= n; i++) {
            let b = blockOf(nodes[i - 1], i);
            block[i] = b;
            while (block[b.first - 1].posn + block[b.first - 1].width > b.posn) {
                b = mergeBlocks(block[b.first - 1], b);
                block[b.last] = b;
                block[b.first] = b;
            }
        }
        let i = 1;
        for (;;) {
            const b = block[i];
            const first = nodes[b.first - 1];
            nodes[i - 1].x = int(b.posn + (first.width + first.reserved + X_JUMP) / 2);
            for (i = i + 1; i <= b.last; i++) {
                const v1 = nodes[i - 1];
                const v2 = nodes[i - 2];
                const xsep = idiv(v1.width + v1.reserved + v2.width + v2.reserved, 2) + X_JUMP;
                v1.x = v2.x + xsep;
            }
            i = b.last + 1;
            if (i > n) break;
        }
    }

    /** True iff the straight line between a and b does not cross a node on the layers in between. */
    private free(a: GraphNode, b: GraphNode): boolean {
        if (a.layer > b.layer) [a, b] = [b, a];
        for (const n of this.nodes)
            if (n !== a && n !== b && a.layer < n.layer && n.layer < b.layer && n.shape !== null)
                if (segmentIntersectsBox(a.x, a.y, b.x, b.y, n.boundingBox(10, 10))) return false;
        return true;
    }

    private checkUpperCollision(top: GraphNode[]) {
        const room = 2;
        for (let i = 0; i < top.length; i++) {
            const a = top[i];
            // Alloy computes left and right identically; kept for faithful layouts.
            const left = a.x - idiv(a.width, 2);
            const right = a.x - idiv(a.width, 2);
            for (const e of a.outs) {
                const b = e.b;
                if (b.x >= right) {
                    for (let j = i + 1; j < top.length; j++) {
                        const c = top[j];
                        if (c.shape === null) continue;
                        const ctop = c.y - idiv(c.height, 2);
                        const cbottom = c.y + idiv(c.height, 2);
                        e.path.bendDown(c.x - idiv(c.width, 2), ctop - room, cbottom + room, 3);
                    }
                } else if (b.x <= left) {
                    for (let j = i - 1; j >= 0; j--) {
                        const c = top[j];
                        if (c.shape === null) continue;
                        const ctop = c.y - idiv(c.height, 2);
                        const cbottom = c.y + idiv(c.height, 2);
                        e.path.bendDown(c.x + idiv(c.width, 2), ctop - room, cbottom + room, 3);
                    }
                }
            }
        }
    }

    private checkLowerCollision(bottom: GraphNode[]) {
        const room = 2;
        for (let i = 0; i < bottom.length; i++) {
            const b = bottom[i];
            const left = b.x - idiv(b.width, 2);
            const right = b.x - idiv(b.width, 2);
            for (const e of b.ins) {
                const a = e.a;
                if (a.x <= left) {
                    for (let j = i - 1; j >= 0; j--) {
                        const c = bottom[j];
                        if (c.shape === null) continue;
                        const ctop = c.y - idiv(c.height, 2);
                        const cbottom = c.y + idiv(c.height, 2);
                        e.path.bendUp(c.x + idiv(c.width, 2), ctop - room, cbottom + room, 3);
                    }
                } else if (a.x >= right) {
                    for (let j = i + 1; j < bottom.length; j++) {
                        const c = bottom[j];
                        if (c.shape === null) continue;
                        const ctop = c.y - idiv(c.height, 2);
                        const cbottom = c.y + idiv(c.height, 2);
                        e.path.bendUp(c.x - idiv(c.width, 2), ctop - room, cbottom + room, 3);
                    }
                }
            }
        }
    }

    /** Computes the layout of all nodes and edges. */
    layout() {
        if (this.nodes.length === 0) return;
        for (const n of this.nodes) n.calcBounds();
        this.assignOrder();
        this.backEdges();
        const layers = this.decideLayer();
        this.dummyNodesIfNeeded();
        this.reorderPerLayer();
        this.layerHeights = new Array(layers).fill(0);
        for (let layer = layers - 1; layer >= 0; layer--) {
            let x = 5;
            let h = 0;
            for (const n of this.layer(layer)) {
                n.x = x + idiv(n.width, 2);
                h = Math.max(h, n.height);
                x = x + n.width + n.reserved + 20;
            }
            this.layerHeights[layer] = h;
        }
        // Without edges the nodes would collapse into the center, so only refine with several layers.
        if (layers > 1)
            for (let i = 0; i < 3; i++)
                for (let layer = 0; layer < layers; layer++) this.xAssignment(this.layer(layer));
        let py = 5;
        for (let layer = layers - 1; layer >= 0; layer--) {
            const ph = this.layerHeights[layer];
            for (const n of this.layer(layer)) n.y = py + idiv(ph, 2);
            py = py + ph + Y_JUMP;
        }
        this.relayoutEdges(true);
    }

    /** Recomputes edge paths, arrowheads and labels; optionally straightens long edges first. */
    relayoutEdges(straighten: boolean) {
        if (straighten) {
            // Move dummy nodes to straighten lines where possible.
            for (let i = 0; i < 5; i++)
                for (const n of this.nodes)
                    if (n.shape === null) {
                        const e1 = n.ins[0];
                        const e2 = n.outs[0];
                        if (!this.free(e1.a, e2.b)) continue;
                        const slope = (e2.b.x - e1.a.x) / (e2.b.y - e1.a.y);
                        n.x = int((n.y - e1.a.y) * slope + e1.a.x);
                    }
            for (const e of this.edges)
                if (e.a.shape !== null && e.b.shape === null) {
                    const a = e.a;
                    let b: GraphNode;
                    for (let ee = e; ; ) {
                        b = ee.b;
                        if (b.shape !== null) break;
                        ee = b.outs[0];
                    }
                    if (!this.free(a, b)) continue;
                    const slope = (b.x - a.x) / (b.y - a.y);
                    for (let ee = e; ; ) {
                        b = ee.b;
                        if (b.shape !== null) break;
                        b.x = int((b.y - a.y) * slope + a.x);
                        ee = b.outs[0];
                    }
                }
            // Restore the order-by-x invariant and keep nodes from bunching up.
            for (let i = 0; i < this.layers.length; i++) {
                this.layers[i].sort((o1, o2) => (o1.x < o2.x ? -1 : o1.x > o2.x ? 1 : 0));
                const layer = [...this.layer(i)];
                for (let j = idiv(layer.length, 2); j >= 0 && j < layer.length - 1; j++) {
                    const a = layer[j];
                    const b = layer[j + 1];
                    const ax = a.shape === null ? a.x : a.x + idiv(a.width, 2) + a.reserved;
                    const bx = b.shape === null ? b.x : b.x - idiv(b.width, 2);
                    if (bx <= ax || bx - ax < 5) b.x = ax + 5 + idiv(b.width, 2);
                }
                for (let j = idiv(layer.length, 2); j > 0 && j < layer.length; j--) {
                    const a = layer[j - 1];
                    const b = layer[j];
                    const ax = a.shape === null ? a.x : a.x + idiv(a.width, 2) + a.reserved;
                    const bx = b.shape === null ? b.x : b.x - idiv(b.width, 2);
                    if (bx <= ax || bx - ax < 5) a.x = bx - 5 - idiv(a.width, 2) - a.reserved;
                }
            }
        }
        for (const e of this.edges) e.resetPath();
        for (let layer = this.layers.length - 1; layer > 0; layer--) {
            const top = this.layer(layer);
            const bottom = this.layer(layer - 1);
            this.checkUpperCollision(top);
            this.checkLowerCollision(bottom);
            this.checkUpperCollision(top);
        }
        this.finishEdges();
    }

    /** Recomputes the edges around layer i only (used while dragging). */
    relayoutEdgesAround(i: number) {
        if (this.nodes.length === 0) return;
        for (const n of this.layer(i)) for (const e of n.selfs) e.resetPath();
        if (i > 0) {
            const top = this.layer(i);
            const bottom = this.layer(i - 1);
            for (const n of top) for (const e of n.outs) e.resetPath();
            this.checkUpperCollision(top);
            this.checkLowerCollision(bottom);
            this.checkUpperCollision(top);
        }
        if (i < this.layers.length - 1) {
            const top = this.layer(i + 1);
            const bottom = this.layer(i);
            for (const n of top) for (const e of n.outs) e.resetPath();
            this.checkUpperCollision(top);
            this.checkLowerCollision(bottom);
            this.checkUpperCollision(top);
        }
        this.finishEdges();
    }

    private finishEdges() {
        const sp = new AvailableSpace();
        for (const n of this.nodes)
            if (n.shape !== null)
                sp.add(n.x - idiv(n.width, 2), n.y - idiv(n.height, 2), n.width + n.reserved, n.height);
        for (const e of this.edges) {
            e.layoutArrowHeads();
            e.repositionLabel(sp);
        }
    }

    /** Bounding box of everything drawn (nodes, edges, labels). */
    bounds(): { x: number; y: number; width: number; height: number } {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const add = (x: number, y: number) => {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        };
        for (const n of this.nodes) {
            if (n.shape === null) continue;
            add(n.x - idiv(n.width, 2), n.y - idiv(n.height, 2));
            add(n.x + idiv(n.width, 2) + n.reserved, n.y + idiv(n.height, 2));
        }
        for (const e of this.edges) {
            for (const c of e.path.list) {
                add(c.x1, c.y1);
                add(c.x2, c.y2);
                add(c.cx1, c.cy1);
                add(c.cx2, c.cy2);
            }
            if (e.labelW > 0) {
                add(e.labelX, e.labelY);
                add(e.labelX + e.labelW, e.labelY + e.labelH);
            }
        }
        if (minX === Infinity) return { x: 0, y: 0, width: 10, height: 10 };
        const pad = 10;
        return { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad };
    }
}

interface Block {
    first: number;
    last: number;
    weight: number;
    width: number;
    posn: number;
    wposn: number;
}

const SENTINEL: Block = { first: 0, last: 0, weight: 0, width: 0, posn: -Infinity, wposn: 0 };

function weightOf(n: GraphNode): number {
    let ans = 0;
    for (const e of n.ins) ans += e.weight;
    for (const e of n.outs) ans += e.weight;
    return ans;
}

/** Desired x of a node: weighted average of its neighbors' x. */
function desiredX(n: GraphNode): number {
    const wt = weightOf(n);
    if (wt === 0) return 0;
    let ans = 0;
    for (const e of n.ins) ans += e.weight * e.a.x;
    for (const e of n.outs) ans += e.weight * e.b.x;
    return ans / wt;
}

function blockOf(v: GraphNode, i: number): Block {
    const width = v.width + v.reserved + X_JUMP;
    const posn = desiredX(v) - width / 2;
    const weight = weightOf(v);
    return { first: i, last: i, width, posn, weight, wposn: weight * posn };
}

function mergeBlocks(a: Block, b: Block): Block {
    const wposn = a.wposn + b.wposn - a.width * b.weight;
    const weight = a.weight + b.weight;
    return { first: a.first, last: b.last, width: a.width + b.width, wposn, weight, posn: wposn / weight };
}

function segmentIntersectsBox(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: { x: number; y: number; w: number; h: number }
): boolean {
    const inside = (x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inside(x1, y1) || inside(x2, y2)) return true;
    const corners: Point[] = [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
    ];
    for (let i = 0; i < 4; i++) {
        const [x3, y3] = corners[i];
        const [x4, y4] = corners[(i + 1) % 4];
        if (segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4)) return true;
    }
    return false;
}

function segmentsIntersect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number
): boolean {
    const d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
        Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    const d1 = d(x3, y3, x4, y4, x1, y1);
    const d2 = d(x3, y3, x4, y4, x2, y2);
    const d3 = d(x1, y1, x2, y2, x3, y3);
    const d4 = d(x1, y1, x2, y2, x4, y4);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    const on = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
        Math.min(ax, bx) <= px && px <= Math.max(ax, bx) && Math.min(ay, by) <= py && py <= Math.max(ay, by);
    return (
        (d1 === 0 && on(x3, y3, x4, y4, x1, y1)) ||
        (d2 === 0 && on(x3, y3, x4, y4, x2, y2)) ||
        (d3 === 0 && on(x1, y1, x2, y2, x3, y3)) ||
        (d4 === 0 && on(x1, y1, x2, y2, x4, y4))
    );
}

function pointInPolygon(poly: Point[], x: number, y: number): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Flattens a closed path of quadratic curves into a polygon (for hit testing). */
function flattenQuads(start: Point, quads: [number, number, number, number][]): Point[] {
    const pts: Point[] = [];
    let [px, py] = start;
    for (const [cx, cy, x, y] of quads) {
        for (let k = 1; k <= 12; k++) {
            const t = k / 12;
            const u = 1 - t;
            pts.push([u * u * px + 2 * u * t * cx + t * t * x, u * u * py + 2 * u * t * cy + t * t * y]);
        }
        [px, py] = [x, y];
    }
    return pts;
}

export class GraphNode {
    x = 0;
    y = 0;
    layer = 0;
    pos: number;
    readonly ins: GraphEdge[] = [];
    readonly outs: GraphEdge[] = [];
    readonly selfs: GraphEdge[] = [];
    /** Payload for the renderer (e.g. the Alloy atom). */
    data: unknown;
    color = '#ffffff';
    style: DotStyle = 'Solid';
    fontBold = false;
    private _shape: DotShape | null = 'Box';
    private readonly labels: string[] = [];

    // Geometry, computed by calcBounds (dirty while updown < 0).
    private updown = -1;
    private side = 0;
    private yShift = 0;
    private labelWidth = 0;
    private labelHeight = 0;
    private _reserved = 0;
    private poly: Point[] = [];
    private geometry_: NodeGeometry | null = null;

    constructor(
        readonly graph: Graph,
        /** Name used to order nodes deterministically (Alloy's uuid.toString()). */
        readonly uuid: string,
        ...labels: string[]
    ) {
        this.pos = graph.nodes.length;
        graph.nodes.push(this);
        if (graph.layers.length === 0) graph.layers.push([]);
        graph.layers[0].push(this);
        this.labels.push(...labels);
    }

    /** Null for the invisible dummy nodes inserted on long edges. */
    get shape(): DotShape | null {
        return this._shape;
    }

    setShape(shape: DotShape | null): this {
        if (this._shape !== shape) {
            this._shape = shape;
            this.updown = -1;
        }
        return this;
    }

    setColor(color: string | null | undefined): this {
        if (color) this.color = color;
        this.updown = -1;
        return this;
    }

    setStyle(style: DotStyle | null | undefined): this {
        if (style) this.style = style;
        return this;
    }

    addLabel(label: string): this {
        if (label) {
            this.labels.push(label);
            this.updown = -1;
        }
        return this;
    }

    get textLines(): readonly string[] {
        return this.labels;
    }

    setLayer(newLayer: number) {
        if (newLayer < 0) throw new Error('The layer cannot be negative!');
        if (this.layer === newLayer) return;
        const old = this.graph.layers[this.layer];
        old.splice(old.indexOf(this), 1);
        this.layer = newLayer;
        while (newLayer >= this.graph.layers.length) this.graph.layers.push([]);
        this.graph.layers[newLayer].push(this);
    }

    get width(): number {
        if (this.updown < 0) this.calcBounds();
        return this.side + this.side;
    }

    get height(): number {
        if (this.updown < 0) this.calcBounds();
        return this.updown + this.updown;
    }

    /** Horizontal room reserved to the right for self loops and their labels. */
    get reserved(): number {
        if (this.selfs.length === 0) return 0;
        if (this.updown < 0) this.calcBounds();
        return this._reserved;
    }

    /** Vertical offset of the label block (non-zero for house/triangle shapes). */
    get labelShift(): number {
        if (this.updown < 0) this.calcBounds();
        return this.yShift;
    }

    get geometry(): NodeGeometry | null {
        if (this.updown < 0) this.calcBounds();
        return this.geometry_;
    }

    boundingBox(xfluff: number, yfluff: number) {
        if (this.updown < 0) this.calcBounds();
        return {
            x: this.x - this.side - xfluff,
            y: this.y - this.updown - yfluff,
            w: this.side + this.side + xfluff + xfluff,
            h: this.updown + this.updown + yfluff + yfluff,
        };
    }

    contains(x: number, y: number): boolean {
        if (this._shape === null) return false;
        if (this.updown < 0) this.calcBounds();
        return pointInPolygon(this.poly, x - this.x, y - this.y);
    }

    /** Computes the node's size and outline from its shape and labels (GraphNode.calcBounds). */
    calcBounds() {
        const ad = this.graph.lineHeight;
        const metrics = this.graph.metrics;
        this._reserved = this.yShift = 0;
        let width = 2 * LABEL_PADDING;
        if (width < DUMMY_WIDTH) this.side = idiv(DUMMY_WIDTH, 2);
        let height = width;
        if (height < DUMMY_HEIGHT) this.updown = idiv(DUMMY_HEIGHT, 2);
        this.poly = [];
        this.geometry_ = null;
        if (this._shape === null) {
            // Dummy node: as in Alloy, 30 wide and (since updown stays -1) -2 high, so it never
            // makes its layer taller.
            this.side = idiv(DUMMY_WIDTH, 2);
            this.updown = -1;
            return;
        }
        for (const t of this.labels) {
            const ww = int(metrics.width(t, this.fontBold)) + 1;
            if (width < ww) width = ww;
            height = height + ad;
        }
        let hw = idiv(width + 1, 2) + LABEL_PADDING;
        if (hw < idiv(ad, 2)) hw = idiv(ad, 2);
        width = hw * 2;
        this.side = hw;
        let hh = idiv(height + 1, 2) + LABEL_PADDING;
        if (hh < idiv(ad, 2)) hh = idiv(ad, 2);
        height = hh * 2;
        this.updown = hh;
        const poly: Point[] = [];
        const add = (x: number, y: number) => poly.push([x, y]);
        const lines: [number, number, number, number][] = [];
        let extraOutlines: Point[][] = [];
        switch (this._shape) {
            case 'House': {
                this.yShift = idiv(ad, 2);
                this.updown = this.updown + this.yShift;
                add(-hw, this.yShift - hh);
                add(0, -this.updown);
                add(hw, this.yShift - hh);
                add(hw, this.yShift + hh);
                add(-hw, this.yShift + hh);
                break;
            }
            case 'Inv House': {
                this.yShift = -idiv(ad, 2);
                this.updown = this.updown - this.yShift;
                add(-hw, this.yShift - hh);
                add(hw, this.yShift - hh);
                add(hw, this.yShift + hh);
                add(0, this.updown);
                add(-hw, this.yShift + hh);
                break;
            }
            case 'Triangle':
            case 'Inv Triangle': {
                let dx = int(height / SQRT3) + 1;
                if (dx < 6) dx = 6;
                let dy = int(hw * SQRT3) + 1;
                if (dy < 6) dy = 6;
                dy = idiv(dy, 2) * 2;
                this.side += dx;
                this.updown += idiv(dy, 2);
                if (this._shape === 'Triangle') {
                    this.yShift = idiv(dy, 2);
                    add(0, -this.updown);
                    add(hw + dx, this.updown);
                    add(-hw - dx, this.updown);
                } else {
                    this.yShift = -idiv(dy, 2);
                    add(0, this.updown);
                    add(hw + dx, -this.updown);
                    add(-hw - dx, -this.updown);
                }
                break;
            }
            case 'Hexagon': {
                this.side += ad;
                add(-hw - ad, 0);
                add(-hw, -hh);
                add(hw, -hh);
                add(hw + ad, 0);
                add(hw, hh);
                add(-hw, hh);
                break;
            }
            case 'Trapezoid': {
                this.side += ad;
                add(-hw, -hh);
                add(hw, -hh);
                add(hw + ad, hh);
                add(-hw - ad, hh);
                break;
            }
            case 'Inv Trapezoid': {
                this.side += ad;
                add(-hw - ad, -hh);
                add(hw + ad, -hh);
                add(hw, hh);
                add(-hw, hh);
                break;
            }
            case 'Parallelogram': {
                this.side += ad;
                add(-hw, -hh);
                add(hw + ad, -hh);
                add(hw, hh);
                add(-hw - ad, hh);
                break;
            }
            case 'Lined Diamond':
            case 'Diamond': {
                if (this._shape === 'Lined Diamond') {
                    if (hw < 10) {
                        hw = 10;
                        this.side = 10;
                        width = 20;
                    }
                    if (hh < 10) {
                        hh = 10;
                        this.updown = 10;
                        height = 20;
                    }
                }
                this.updown += hw;
                this.side += hh;
                add(-hw - hh, 0);
                add(0, -hh - hw);
                add(hw + hh, 0);
                add(0, hh + hw);
                if (this._shape === 'Lined Diamond') {
                    const s = this.side;
                    lines.push(
                        [-s + 8, -8, -s + 8, 8],
                        [-8, -s + 8, 8, -s + 8],
                        [s - 8, -8, s - 8, 8],
                        [-8, s - 8, 8, s - 8]
                    );
                }
                break;
            }
            case 'Lined Square': {
                if (hh < hw) hh = hw;
                else hw = hh;
                if (hh < 6) hh = hw = 6;
                width = hw * 2;
                this.side = hw;
                height = hh * 2;
                this.updown = hh;
                this.side += 4;
                this.updown += 4;
                add(-hw - 4, -hh - 4);
                add(hw + 4, -hh - 4);
                add(hw + 4, hh + 4);
                add(-hw - 4, hh + 4);
                const s = this.side;
                lines.push(
                    [-s, -s + 8, -s + 8, -s],
                    [s, -s + 8, s - 8, -s],
                    [-s, s - 8, -s + 8, s],
                    [s, s - 8, s - 8, s]
                );
                break;
            }
            case 'Octagon':
            case 'Dbl Octagon':
            case 'Tpl Octagon': {
                const dx = idiv(width, 3);
                const dy = ad;
                this.updown += dy;
                const octagon = (grow: number, x1: number, y1: number): Point[] => [
                    [-hw - grow, -hh - y1],
                    [-hw + dx - x1, -hh - dy - grow],
                    [hw - dx + x1, -hh - dy - grow],
                    [hw + grow, -hh - y1],
                    [hw + grow, hh + y1],
                    [hw - dx + x1, hh + dy + grow],
                    [-hw + dx - x1, hh + dy + grow],
                    [-hw - grow, hh + y1],
                ];
                let outline = octagon(0, 0, 0);
                if (this._shape !== 'Octagon') {
                    const c = Math.sqrt(dx * dx + dy * dy);
                    const a = (dx * dy) / c;
                    const k = ((a + 5) * dy) / dx;
                    const r = Math.sqrt((a + 5) * (a + 5) + k * k) - dy;
                    const dx1 = ((r - 5) * dx) / dy;
                    const dy1 = -(((dx + 5) * dy) / dx - dy - r);
                    this.updown += 5;
                    this.side += 5;
                    extraOutlines = [outline];
                    outline = octagon(5, int(Math.round(dx1)), int(Math.round(dy1)));
                    if (this._shape === 'Tpl Octagon') {
                        this.updown += 5;
                        this.side += 5;
                        extraOutlines.push(outline);
                        outline = octagon(10, int(Math.round(dx1 * 2)), int(Math.round(dy1 * 2)));
                    }
                }
                poly.push(...outline);
                break;
            }
            case 'Lined Circle':
            case 'Circle':
            case 'Dbl Circle': {
                let radius = int(Math.sqrt(hw * hw + hh * hh)) + 2;
                if (this._shape === 'Dbl Circle') radius += 5;
                const L = int(radius / COS18) + 2;
                const a = int(L * SIN36);
                const b = int(L * COS36);
                const c = int(radius * TAN18);
                add(-L, 0);
                add(-b, a);
                add(-c, L);
                add(c, L);
                add(b, a);
                add(L, 0);
                add(b, -a);
                add(c, -L);
                add(-c, -L);
                add(-b, -a);
                this.updown = L;
                this.side = L;
                const circleLines: [number, number, number, number][] = [];
                if (this._shape === 'Lined Circle' && 10 * radius >= 25 && radius > 5) {
                    const d = int(Math.sqrt(10 * radius - 25));
                    if (d > 0) circleLines.push([-d, -radius + 5, d, -radius + 5], [-d, radius - 5, d, radius - 5]);
                }
                this.geometry_ = {
                    kind: 'circle',
                    radius,
                    innerRadius: this._shape === 'Dbl Circle' ? radius - 5 : undefined,
                    lines: circleLines,
                };
                break;
            }
            case 'Egg':
            case 'Ellipse': {
                const pad = idiv(ad, 2);
                this.side += pad;
                this.updown += pad;
                const d = this._shape === 'Ellipse' ? 0 : idiv(ad, 2);
                const s = this.side;
                const u = this.updown;
                const quads: [number, number, number, number][] = [
                    [-s, -u, 0, -u],
                    [s, -u, s, d],
                    [s, u, 0, u],
                    [-s, u, -s, d],
                ];
                poly.push(...flattenQuads([-s, d], quads));
                this.geometry_ = {
                    kind: 'path',
                    d: `M ${-s} ${d} ` + quads.map(([cx, cy, x, y]) => `Q ${cx} ${cy} ${x} ${y}`).join(' ') + ' Z',
                };
                // Alloy falls through to the box case here, which grows side/updown once more.
                hw = hw + idiv(ad, 2);
                this.side = hw;
                hh = hh + idiv(ad, 2);
                this.updown = hh;
                break;
            }
            default: {
                // Box
                add(-hw, -hh);
                add(hw, -hh);
                add(hw, hh);
                add(-hw, hh);
            }
        }
        this.labelWidth = width;
        this.labelHeight = height;
        this.poly = poly;
        if (!this.geometry_) this.geometry_ = { kind: 'polygon', outline: poly, extraOutlines, lines };
        for (let i = 0; i < this.selfs.length; i++) {
            if (i === 0) {
                this._reserved = this.side + SELF_LOOP_A;
                continue;
            }
            this._reserved += int(metrics.width(this.selfs[i - 1].label, false)) + SELF_LOOP_GL + SELF_LOOP_GR;
        }
        if (this._reserved > 0)
            this._reserved +=
                int(metrics.width(this.selfs[this.selfs.length - 1].label, false)) + SELF_LOOP_GL + SELF_LOOP_GR;
    }

    /** Width of the label block, used to center label lines. */
    get textWidth(): number {
        if (this.updown < 0) this.calcBounds();
        return this.labelWidth;
    }

    get textHeight(): number {
        if (this.updown < 0) this.calcBounds();
        return this.labelHeight;
    }

    // ----- Dragging (GraphNode.tweak and helpers) -----

    private setLayerY(layer: number, y: number) {
        for (const n of this.graph.layer(layer)) n.y = y;
    }

    private shiftUp(y: number) {
        const ph = this.graph.layerHeights;
        const yJump = idiv(Y_JUMP, 6);
        let i = this.layer;
        this.setLayerY(i, y);
        y = y - idiv(ph[i], 2);
        for (i++; i < this.graph.layers.length; i++) {
            const first = this.graph.layer(i)[0];
            if (first.y + idiv(ph[i], 2) + yJump > y) this.setLayerY(i, y - idiv(ph[i], 2) - yJump);
            y = first.y - idiv(ph[i], 2);
        }
        this.graph.relayoutEdges(false);
    }

    private shiftDown(y: number) {
        const ph = this.graph.layerHeights;
        const yJump = idiv(Y_JUMP, 6);
        let i = this.layer;
        this.setLayerY(i, y);
        y = y + idiv(ph[i], 2);
        for (i--; i >= 0; i--) {
            const first = this.graph.layer(i)[0];
            if (first.y - idiv(ph[i], 2) - yJump < y) this.setLayerY(i, y + idiv(ph[i], 2) + yJump);
            y = first.y + idiv(ph[i], 2);
        }
        this.graph.relayoutEdges(false);
    }

    private shiftLeft(peers: GraphNode[], i: number, x: number) {
        const xJump = idiv(X_JUMP, 3);
        this.x = x;
        x = x - (this._shape === null ? 0 : this.side);
        for (i--; i >= 0; i--) {
            const node = peers[i];
            const side = node._shape === null ? 0 : node.side;
            if (node.x + side + node.reserved + xJump > x) node.x = x - side - node.reserved - xJump;
            x = node.x - side;
        }
    }

    private shiftRight(peers: GraphNode[], i: number, x: number) {
        const xJump = idiv(X_JUMP, 3);
        this.x = x;
        x = x + (this._shape === null ? 0 : this.side) + this.reserved;
        for (i++; i < peers.length; i++) {
            const node = peers[i];
            const side = node._shape === null ? 0 : node.side;
            if (node.x - side - xJump < x) node.x = x + side + xJump;
            x = node.x + side + node.reserved;
        }
    }

    private swapNodes(i: number, j: number) {
        const list = this.graph.layers[this.layer];
        [list[i], list[j]] = [list[j], list[i]];
    }

    private swapLeft(peers: GraphNode[], i: number, x: number) {
        const side = this._shape === null ? 2 : this.side;
        const left = x - side;
        for (;;) {
            if (i === 0) {
                this.x = x;
                return;
            }
            const other = peers[i - 1];
            const otherSide = other._shape === null ? 0 : other.side;
            if (other.x + otherSide + other.reserved < left) {
                this.x = x;
                return;
            }
            this.swapNodes(i, i - 1);
            i--;
            if (other._shape !== null) other.shiftRight(peers, i + 1, x + side + this.reserved + otherSide);
        }
    }

    private swapRight(peers: GraphNode[], i: number, x: number) {
        const side = this._shape === null ? 2 : this.side;
        const right = x + side + this.reserved;
        for (;;) {
            if (i === peers.length - 1) {
                this.x = x;
                return;
            }
            const other = peers[i + 1];
            const otherSide = other._shape === null ? 0 : other.side;
            if (other.x - otherSide > right) {
                this.x = x;
                return;
            }
            this.swapNodes(i, i + 1);
            i++;
            if (other._shape !== null) other.shiftLeft(peers, i - 1, x - side - other.reserved - otherSide);
        }
    }

    /** Moves the node (as when dragged), pushing neighbors aside and re-routing edges. */
    tweak(x: number, y: number) {
        x = int(x);
        y = int(y);
        if (this.x === x && this.y === y) return;
        const layer = this.graph.layer(this.layer);
        const i = layer.indexOf(this);
        if (this.x > x) this.swapLeft(layer, i, x);
        else if (this.x < x) this.swapRight(layer, i, x);
        if (this.y > y) this.shiftUp(y);
        else if (this.y < y) this.shiftDown(y);
        else this.graph.relayoutEdgesAround(this.layer);
    }
}

export interface EdgeOptions {
    ahead?: boolean;
    bhead?: boolean;
    style?: DotStyle;
    color?: string;
    data?: unknown;
}

const SMALL_FAN = (16 * Math.PI) / 180;
const BIG_FAN = (32 * Math.PI) / 180;

export class GraphEdge {
    a: GraphNode;
    b: GraphNode;
    ahead: boolean;
    bhead: boolean;
    style: DotStyle;
    color: string;
    weight = 1;
    /** Payload for the renderer (e.g. the Alloy tuple). */
    data: unknown;
    labelX = 0;
    labelY = 0;
    readonly labelW: number;
    readonly labelH: number;
    private path_: Curve | null = null;

    constructor(
        from: GraphNode,
        to: GraphNode,
        /** Identifies the edge across its dummy segments. */
        readonly uuid: string,
        readonly label: string,
        /** Edges of the same group (relation) are highlighted together. */
        readonly group: string,
        options: EdgeOptions = {}
    ) {
        this.a = from;
        this.b = to;
        if (from.graph !== to.graph) throw new Error('You cannot draw an edge between two different graphs.');
        if (from === to) from.selfs.push(this);
        else {
            from.outs.push(this);
            to.ins.push(this);
        }
        from.graph.edges.push(this);
        this.ahead = options.ahead ?? false;
        this.bhead = options.bhead ?? true;
        this.style = options.style ?? 'Solid';
        this.color = options.color ?? '#000000';
        this.data = options.data;
        const metrics = from.graph.metrics;
        this.labelW = label ? int(metrics.width(label, false)) : 0;
        this.labelH = label ? metrics.lineHeight : 0;
    }

    get path(): Curve {
        if (!this.path_) this.resetPath();
        return this.path_!;
    }

    setHeads(from: boolean, to: boolean): this {
        this.ahead = from;
        this.bhead = to;
        return this;
    }

    setWeight(w: number): this {
        this.weight = Math.min(10000, Math.max(1, w));
        return this;
    }

    reverse() {
        if (this.a === this.b) return;
        remove(this.a.outs, this);
        remove(this.b.ins, this);
        this.a.ins.push(this);
        this.b.outs.push(this);
        [this.a, this.b] = [this.b, this.a];
    }

    change(newTo: GraphNode) {
        if (this.a === this.b) remove(this.a.selfs, this);
        else {
            remove(this.a.outs, this);
            remove(this.b.ins, this);
        }
        this.b = newTo;
        if (this.a === this.b) this.a.selfs.push(this);
        else {
            this.a.outs.push(this);
            this.b.ins.push(this);
        }
    }

    /** Straight path (fanned out for parallel edges) or a loop for self edges. */
    resetPath() {
        const a = this.a;
        const b = this.b;
        const ax = a.x;
        const ay = a.y;
        const metrics = a.graph.metrics;
        if (a === b) {
            let w = 0;
            for (let i = 0; i < a.selfs.length; i++) {
                if (i === 0) w = idiv(a.width, 2) + SELF_LOOP_A;
                else w = w + metrics.width(a.selfs[i - 1].label, false) + SELF_LOOP_GL + SELF_LOOP_GR;
                const e = a.selfs[i];
                if (e !== this) continue;
                const h = (a.height / 2) * 0.7;
                const k = 0.55238;
                const wa = a.width / 2;
                const wb = w - wa;
                const p = new Curve(ax, ay);
                p.cubicTo(ax, ay - k * h, ax + wa - k * wa, ay - h, ax + wa, ay - h);
                p.cubicTo(ax + wa + k * wb, ay - h, ax + wa + wb, ay - k * h, ax + wa + wb, ay);
                p.cubicTo(ax + wa + wb, ay + k * h, ax + wa + k * wb, ay + h, ax + wa, ay + h);
                p.cubicTo(ax + wa - k * wa, ay + h, ax, ay + k * h, ax, ay);
                e.path_ = p;
                e.labelX = int(ax + w + SELF_LOOP_GL);
                e.labelY = int(ay - e.labelH / 2);
                break;
            }
            if (!this.path_) this.path_ = new Curve(ax, ay);
            return;
        }
        let i = 0;
        let n = 0;
        for (const e of a.outs) {
            if (e === this) i = n++;
            else if (e.b === b) n++;
        }
        const cx = b.x;
        const cy = b.y;
        let bx = (ax + cx) / 2;
        const by = (ay + cy) / 2;
        const p = new Curve(ax, ay);
        const half = idiv(n, 2);
        if (n > 1 && (n & 1) === 1) {
            if (i < half) bx = bx - (half - i) * 10;
            else if (i > half) bx = bx + (i - half) * 10;
            p.lineTo(bx, by).lineTo(cx, cy);
        } else if (n > 1) {
            if (i < half) bx = bx - (half - i) * 10 + 5;
            else bx = bx + (i - half) * 10 + 5;
            p.lineTo(bx, by).lineTo(cx, cy);
        } else {
            p.lineTo(cx, cy);
        }
        this.path_ = p;
    }

    /** Places the label next to the edge, avoiding nodes and other labels. */
    repositionLabel(sp: AvailableSpace) {
        if (!this.label || this.a === this.b) return;
        const gap = this.style === 'Bold' ? 4 : 2;
        let failed = false;
        let p = this.path;
        for (let a = this.a; a.shape === null; ) {
            const e = a.ins[0];
            a = e.a;
            p = e.path.join(p);
        }
        for (let b = this.b; b.shape === null; ) {
            const e = b.outs[0];
            b = e.b;
            p = p.join(e.path);
        }
        const w = this.labelW;
        const h = this.labelH;
        for (let t = 0.5; ; t = t + 0.05) {
            if (t >= 1) {
                failed = true;
                t = 0.7;
            }
            let x1 = p.getX(t);
            let y = p.getY(t);
            let x2 = p.getXatY(y + h, t, 1, x1);
            let x = int(x1 < x2 ? x2 + gap : x1 + gap);
            if (failed || sp.ok(x, int(y), w, h)) {
                sp.add((this.labelX = x), (this.labelY = int(y)), w, h);
                return;
            }
            const t2 = 1 - t;
            x1 = p.getX(t2);
            y = p.getY(t2);
            x2 = p.getXatY(y + h, t2, 1, x1);
            x = int(x1 < x2 ? x2 + gap : x1 + gap);
            if (sp.ok(x, int(y), w, h)) {
                sp.add((this.labelX = x), (this.labelY = int(y)), w, h);
                return;
            }
        }
    }

    /** Shortens the path so arrowheads touch the node outlines. */
    layoutArrowHeads() {
        const c = this.path;
        if (this.ahead && this.a.shape !== null) {
            let inT = 0;
            let outT = 1;
            while (Math.abs(outT - inT) > 0.0001) {
                const t = (inT + outT) / 2;
                if (this.a.contains(c.getX(t), c.getY(t))) inT = t;
                else outT = t;
            }
            c.chopStart(inT);
        }
        if (this.bhead && this.b.shape !== null) {
            let inT = 1;
            let outT = this.a === this.b ? 0.5 : 0;
            while (Math.abs(outT - inT) > 0.0001) {
                const t = (inT + outT) / 2;
                if (this.b.contains(c.getX(t), c.getY(t))) inT = t;
                else outT = t;
            }
            c.chopEnd(inT);
        }
    }

    /** The segments of this edge's chain through dummy nodes, from the first to the last. */
    chain(): GraphEdge[] {
        let e: GraphEdge = this;
        while (e.a.shape === null) e = e.a.ins[0];
        const list = [e];
        while (e.b.shape === null) {
            e = e.b.outs[0];
            list.push(e);
        }
        return list;
    }

    /** SVG path data of the whole edge, smoothed at dummy nodes like Artist.drawSmoothly. */
    svgPath(): string {
        if (this.a === this.b) return curveToSvg(this.path.list);
        const segments = this.chain().flatMap((e) => e.path.list);
        return curveToSvg(smooth(segments));
    }

    /** Filled arrowhead triangles of the whole chain. */
    arrowHeads(bold: boolean): Point[][] {
        const tip = this.a.graph.lineHeight * 0.6;
        const fan = bold || this.style === 'Bold' ? BIG_FAN : SMALL_FAN;
        const heads: Point[][] = [];
        const head = (x: number, y: number, fromX: number, fromY: number) => {
            const t = Math.PI + Math.atan2(y - fromY, x - fromX);
            heads.push([
                [x + tip * Math.cos(t - fan), y + tip * Math.sin(t - fan)],
                [x, y],
                [x + tip * Math.cos(t + fan), y + tip * Math.sin(t + fan)],
            ]);
        };
        const chain = this.a === this.b ? [this] : this.chain();
        for (const e of chain) {
            const list = e.path.list;
            if (list.length === 0) continue;
            if (e.ahead && e.a.shape !== null) head(list[0].x1, list[0].y1, list[0].cx1, list[0].cy1);
            if (e.bhead && e.b.shape !== null) {
                const last = list[list.length - 1];
                head(last.x2, last.y2, last.cx2, last.cy2);
            }
        }
        return heads;
    }
}

function remove<T>(list: T[], x: T) {
    const i = list.indexOf(x);
    if (i >= 0) list.splice(i, 1);
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

function curveToSvg(
    list: { x1: number; y1: number; cx1: number; cy1: number; cx2: number; cy2: number; x2: number; y2: number }[]
) {
    if (list.length === 0) return '';
    let d = `M ${fmt(list[0].x1)} ${fmt(list[0].y1)}`;
    for (const c of list) d += ` C ${fmt(c.cx1)} ${fmt(c.cy1)} ${fmt(c.cx2)} ${fmt(c.cy2)} ${fmt(c.x2)} ${fmt(c.y2)}`;
    return d;
}

/** Adjusts control points where segments meet so the joined curve bends smoothly (Artist.drawSmoothly). */
function smooth(input: import('./curve').Cubic[]) {
    const SMOOTH = 15;
    const inRange = (l: number, x: number, r: number) => (l <= x && x <= r) || (r <= x && x <= l);
    const out = [];
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < input.length; i++) {
        const c = { ...input[i] };
        const c2 = i + 1 < input.length ? input[i + 1] : null;
        if (i > 0) {
            c.cx1 = cx;
            c.cy1 = cy;
        }
        if (!c2) {
            out.push(c);
            break;
        }
        const slope =
            (c.x1 < c.x2 && c2.x2 < c2.x1) || (c.x1 > c.x2 && c2.x2 > c2.x1) ? 0 : (c2.x2 - c.x1) / (c2.y2 - c.y1);
        const tmp = c.y2 - SMOOTH;
        const tmpx = c.x2 - SMOOTH * slope;
        if (tmp > c.cy1 && tmp < c.y2 && inRange(c.x1, tmpx, c.x2)) {
            c.cy2 = tmp;
            c.cx2 = tmpx;
        }
        const tmp2 = c2.y1 + SMOOTH;
        const tmp2x = c2.x1 + SMOOTH * slope;
        if (tmp2 > c2.y1 && tmp2 < c2.cy2 && inRange(c2.x1, tmp2x, c2.x2)) {
            cy = tmp2;
            cx = tmp2x;
        } else {
            cy = c2.cy1;
            cx = c2.cx1;
        }
        out.push(c);
    }
    return out;
}
