/** Exports a rendered graph SVG as an .svg or .png download. */
import { Graph } from '../core/graph/graph';
import { GRAPH_FONT_FAMILY } from '../core/graph/textMetrics';

/** Returns standalone SVG markup of the graph (no pan/zoom, white background). */
export function graphSvgMarkup(svg: SVGSVGElement, graph: Graph): string {
    const b = graph.bounds();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('[data-export="skip"]').forEach((el) => el.remove());
    const content = clone.querySelector('[data-role="graph"]');
    content?.removeAttribute('transform');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
    clone.setAttribute('width', String(Math.ceil(b.width)));
    clone.setAttribute('height', String(Math.ceil(b.height)));
    clone.setAttribute('font-family', GRAPH_FONT_FAMILY);
    clone.removeAttribute('class');
    clone.removeAttribute('style');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(b.x));
    bg.setAttribute('y', String(b.y));
    bg.setAttribute('width', String(b.width));
    bg.setAttribute('height', String(b.height));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

export function download(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSvg(svg: SVGSVGElement, graph: Graph, filename = 'alloy-instance.svg') {
    download(filename, new Blob([graphSvgMarkup(svg, graph)], { type: 'image/svg+xml' }));
}

export function exportPng(svg: SVGSVGElement, graph: Graph, filename = 'alloy-instance.png', pixelRatio = 2) {
    const b = graph.bounds();
    const markup = graphSvgMarkup(svg, graph);
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(b.width * pixelRatio);
        canvas.height = Math.ceil(b.height * pixelRatio);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(pixelRatio, pixelRatio);
        ctx.drawImage(img, 0, 0, b.width, b.height);
        canvas.toBlob((blob) => blob && download(filename, blob), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
}
