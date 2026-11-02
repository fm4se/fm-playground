/**
 * Rectangles already occupied by nodes and edge labels, used to place labels
 * without overlap. Port of edu.mit.csail.sdg.alloy4graph.AvailableSpace.
 */
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

export class AvailableSpace {
    private readonly list: Box[] = [];

    /** True iff the rectangle does not overlap any added rectangle. */
    ok(x: number, y: number, w: number, h: number): boolean {
        if (w <= 0 || h <= 0) return true;
        for (const box of this.list) {
            if ((x >= box.x && x <= box.x + box.w - 1) || (x + w >= box.x + 1 && x + w <= box.x + box.w))
                if ((y >= box.y && y <= box.y + box.h - 1) || (y + h >= box.y + 1 && y + h <= box.y + box.h))
                    return false;
            if ((box.x >= x && box.x <= x + w - 1) || (box.x + box.w >= x + 1 && box.x + box.w <= x + w))
                if ((box.y >= y && box.y <= y + h - 1) || (box.y + box.h >= y + 1 && box.y + box.h <= y + h))
                    return false;
        }
        return true;
    }

    add(x: number, y: number, w: number, h: number) {
        if (w > 0 && h > 0) this.list.push({ x, y, w, h });
    }
}
