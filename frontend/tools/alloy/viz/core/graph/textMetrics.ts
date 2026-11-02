/**
 * Text measurement used by the layout (the role of Alloy's Artist font metrics).
 * Layout always happens at Alloy's base font size of 12; font size changes zoom.
 */
export interface TextMetrics {
    /** Width of the text in pixels. */
    width(text: string, bold: boolean): number;
    /** Max ascent of the font. */
    readonly ascent: number;
    /** Max ascent plus max descent: the height of one line of text. */
    readonly lineHeight: number;
}

export const GRAPH_FONT_SIZE = 12;
export const GRAPH_FONT_FAMILY = '"Lucida Grande", "Lucida Sans Unicode", "Segoe UI", Arial, sans-serif';

/** Deterministic metrics for environments without a canvas (tests, SSR). */
export const APPROXIMATE_METRICS: TextMetrics = {
    width: (text, bold) => text.length * (bold ? 7.5 : 7),
    ascent: 12,
    lineHeight: 16,
};

let canvasMetrics: TextMetrics | null = null;

/** Metrics measured with a canvas in the graph font, falling back to approximations. */
export function getTextMetrics(): TextMetrics {
    if (canvasMetrics) return canvasMetrics;
    const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    if (!ctx) return APPROXIMATE_METRICS;
    const fonts = {
        plain: `${GRAPH_FONT_SIZE}px ${GRAPH_FONT_FAMILY}`,
        bold: `bold ${GRAPH_FONT_SIZE}px ${GRAPH_FONT_FAMILY}`,
    };
    ctx.font = fonts.plain;
    const probe = ctx.measureText('ÁMgjy|');
    const ascent = Math.ceil(probe.fontBoundingBoxAscent || probe.actualBoundingBoxAscent || GRAPH_FONT_SIZE);
    const descent = Math.ceil(probe.fontBoundingBoxDescent || probe.actualBoundingBoxDescent || 4);
    const cache = new Map<string, number>();
    canvasMetrics = {
        width(text, bold) {
            const key = (bold ? 'b' : 'p') + text;
            let w = cache.get(key);
            if (w === undefined) {
                ctx.font = bold ? fonts.bold : fonts.plain;
                w = ctx.measureText(text).width;
                cache.set(key, w);
            }
            return w;
        },
        ascent,
        lineHeight: ascent + descent,
    };
    return canvasMetrics;
}
