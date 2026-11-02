/**
 * A path made of cubic Bezier segments.
 * Port of edu.mit.csail.sdg.alloy4graph.Curve.
 */
export interface Cubic {
    x1: number;
    y1: number;
    cx1: number;
    cy1: number;
    cx2: number;
    cy2: number;
    x2: number;
    y2: number;
}

const makeLine = (x1: number, y1: number, x2: number, y2: number): Cubic => ({
    x1,
    y1,
    cx1: (x2 - x1) * 0.3 + x1,
    cy1: (y2 - y1) * 0.3 + y1,
    cx2: (x2 - x1) * 0.6 + x1,
    cy2: (y2 - y1) * 0.6 + y1,
    x2,
    y2,
});

function intersects(x1: number, y1: number, x2: number, y2: number, x: number, y3: number, y4: number): boolean {
    if (!(y3 < y4)) [y3, y4] = [y4, y3];
    if (!((x1 <= x && x <= x2) || (x2 <= x && x <= x1))) return false;
    const m = (y2 - y1) / (x2 - x1);
    const i = (x - x1) * m + y1;
    return (y3 <= i && i <= y4) || (y4 <= i && i <= y3);
}

function at(c: Cubic, t: number, axis: 'x' | 'y'): number {
    const [p0, p1, p2, p3] = axis === 'x' ? [c.x1, c.cx1, c.cx2, c.x2] : [c.y1, c.cy1, c.cy2, c.y2];
    const p = (p1 - p0) * t + p0;
    const q = (p2 - p1) * t + p1;
    const r = (p3 - p2) * t + p2;
    const s = (q - p) * t + p;
    const u = (r - q) * t + q;
    return (u - s) * t + s;
}

/** Splits a cubic at t (de Casteljau). */
export function divide(t: number, c: Cubic): [Cubic, Cubic] {
    const lerp = (a: number, b: number) => (1 - t) * a + t * b;
    const fx1 = lerp(c.x1, c.cx1);
    const mx = lerp(c.cx1, c.cx2);
    const sx2 = lerp(c.cx2, c.x2);
    const fx2 = lerp(fx1, mx);
    const sx1 = lerp(mx, sx2);
    const x = lerp(fx2, sx1);
    const fy1 = lerp(c.y1, c.cy1);
    const my = lerp(c.cy1, c.cy2);
    const sy2 = lerp(c.cy2, c.y2);
    const fy2 = lerp(fy1, my);
    const sy1 = lerp(my, sy2);
    const y = lerp(fy2, sy1);
    return [
        { x1: c.x1, y1: c.y1, cx1: fx1, cy1: fy1, cx2: fx2, cy2: fy2, x2: x, y2: y },
        { x1: x, y1: y, cx1: sx1, cy1: sy1, cx2: sx2, cy2: sy2, x2: c.x2, y2: c.y2 },
    ];
}

export class Curve {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    readonly list: Cubic[] = [];

    constructor(startX: number, startY: number) {
        this.startX = this.endX = startX;
        this.startY = this.endY = startY;
    }

    /** A new curve made of this curve's segments followed by that curve's. */
    join(that: Curve): Curve {
        const ans = new Curve(this.startX, this.startY);
        ans.list.push(...this.list, ...that.list);
        ans.endX = that.endX;
        ans.endY = that.endY;
        return ans;
    }

    lineTo(x: number, y: number): this {
        this.list.push(makeLine(this.endX, this.endY, x, y));
        this.endX = x;
        this.endY = y;
        return this;
    }

    cubicTo(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): this {
        this.list.push({ x1: this.endX, y1: this.endY, cx1: ax, cy1: ay, cx2: bx, cy2: by, x2: cx, y2: cy });
        this.endX = cx;
        this.endY = cy;
        return this;
    }

    /** Bends the first segment crossing the vertical line x in [y1,y2] to pass above y1. */
    bendUp(x: number, y1: number, y2: number, gap: number) {
        for (let i = 0; i < this.list.length; i++) {
            const c = this.list[i];
            if (intersects(c.x1, c.y1, c.x2, c.y2, x, y1, y2)) {
                this.list.splice(i, 1, makeLine(c.x1, c.y1, x, y1 - gap), makeLine(x, y1 - gap, c.x2, c.y2));
                return;
            }
        }
    }

    /** Bends the first segment crossing the vertical line x in [y1,y2] to pass below y2. */
    bendDown(x: number, y1: number, y2: number, gap: number) {
        for (let i = 0; i < this.list.length; i++) {
            const c = this.list[i];
            if (intersects(c.x1, c.y1, c.x2, c.y2, x, y1, y2)) {
                this.list.splice(i, 1, makeLine(c.x1, c.y1, x, y2 + gap), makeLine(x, y2 + gap, c.x2, c.y2));
                return;
            }
        }
    }

    /** Removes the part of the curve before t (0..1 over the whole curve). */
    chopStart(t: number) {
        const n = this.list.length;
        t = t * n;
        const di = Math.floor(t);
        let i = di;
        if (i < 0) return;
        if (i >= n) this.list.length = 0;
        while (i > 0 && this.list.length > 0) {
            this.list.shift();
            i--;
        }
        if (this.list.length === 0) {
            this.startX = this.endX;
            this.startY = this.endY;
            this.list.push(makePoint(this.endX, this.endY));
            return;
        }
        const [, second] = divide(t - di, this.list[0]);
        this.list[0] = second;
        this.startX = second.x1;
        this.startY = second.y1;
    }

    /** Removes the part of the curve after t (0..1 over the whole curve). */
    chopEnd(t: number) {
        const n = this.list.length;
        t = t * n;
        const di = Math.floor(t);
        const i = di;
        if (i < 0) this.list.length = 0;
        if (i >= n) return;
        if (i >= 0) this.list.length = Math.min(this.list.length, i + 1);
        if (this.list.length === 0) {
            this.endX = this.startX;
            this.endY = this.startY;
            this.list.push(makePoint(this.endX, this.endY));
            return;
        }
        const [first] = divide(t - di, this.list[i]);
        this.list[i] = first;
        this.endX = first.x2;
        this.endY = first.y2;
    }

    /** The x where the curve (restricted to [startT,endT]) reaches y, or defaultValue. */
    getXatY(y: number, startT: number, endT: number, defaultValue: number): number {
        let a = startT;
        let b = endT;
        let ay = this.getY(a);
        let by = this.getY(b);
        if (ay > by) {
            [ay, by] = [by, ay];
            [a, b] = [endT, startT];
        }
        if (!(ay <= y && y <= by)) return defaultValue;
        while (Math.abs(a - b) > 0.001) {
            const t = (a + b) / 2;
            const ty = this.getY(t);
            if (ty === y) {
                a = t;
                break;
            } else if (ty < y) a = t;
            else b = t;
        }
        return this.getX(a);
    }

    getX(t: number): number {
        return this.eval(t, 'x');
    }

    getY(t: number): number {
        return this.eval(t, 'y');
    }

    private eval(t: number, axis: 'x' | 'y'): number {
        const n = this.list.length;
        t = t * n;
        const di = Math.floor(t);
        if (di < 0) return axis === 'x' ? this.startX : this.startY;
        if (di >= n) return axis === 'x' ? this.endX : this.endY;
        return at(this.list[di], t - di, axis);
    }
}

const makePoint = (x: number, y: number): Cubic => ({ x1: x, y1: y, cx1: x, cy1: y, cx2: x, cy2: y, x2: x, y2: y });
