/**
 * Colors, shapes, line styles and palettes of the Alloy visualizer.
 * Port of edu.mit.csail.sdg.alloy4graph.{DotColor, DotShape, DotStyle, DotPalette}.
 * The string values are the names Alloy uses in .thm theme files.
 */

export const DOT_PALETTES = ['Classic', 'Standard', 'Martha', 'Neon', 'Tol'] as const;
export type DotPalette = (typeof DOT_PALETTES)[number];

export const DOT_COLORS = ['Magic', 'Yellow', 'Green', 'Blue', 'Red', 'Gray', 'White', 'Black'] as const;
export type DotColor = (typeof DOT_COLORS)[number];

export const DOT_STYLES = ['Solid', 'Dashed', 'Dotted', 'Bold'] as const;
export type DotStyle = (typeof DOT_STYLES)[number];

export const DOT_SHAPES = [
    'Ellipse',
    'Box',
    'Circle',
    'Egg',
    'Triangle',
    'Diamond',
    'Trapezoid',
    'Parallelogram',
    'House',
    'Hexagon',
    'Octagon',
    'Dbl Circle',
    'Dbl Octagon',
    'Tpl Octagon',
    'Inv Triangle',
    'Inv House',
    'Inv Trapezoid',
    'Lined Diamond',
    'Lined Square',
    'Lined Circle',
] as const;
export type DotShape = (typeof DOT_SHAPES)[number];

/** Graphviz color name per palette (Classic, Standard, Martha, Neon, Tol); missing entries fall back to the first. */
const COLOR_NAMES: Record<DotColor, string[]> = {
    Magic: ['magic'],
    Yellow: ['gold', 'yellow', 'lightgoldenrod', 'yellow', 'tol_light_yellow'],
    Green: ['limegreen', 'green2', 'darkolivegreen2', 'chartreuse2', 'tol_light_green'],
    Blue: ['cornflowerblue', 'blue', 'cadetblue', 'cyan', 'tol_light_blue'],
    Red: ['palevioletred', 'red', 'salmon', 'magenta', 'tol_light_red'],
    Gray: ['lightgray', 'lightgray', 'lightgray', 'lightgray', 'tol_light_gray'],
    White: ['white'],
    Black: ['black'],
};

const RGB: Record<string, string> = {
    palevioletred: '#de7194',
    red: '#ff0000',
    tol_light_red: '#cc6677',
    salmon: '#ff8273',
    magenta: '#ff00ff',
    limegreen: '#31cf31',
    green2: '#00ef00',
    tol_light_green: '#aaaa00',
    darkolivegreen2: '#bdef6b',
    chartreuse2: '#73ef00',
    gold: '#ffd700',
    yellow: '#ffff00',
    tol_light_yellow: '#eedd88',
    lightgoldenrod: '#efdf84',
    cornflowerblue: '#6396ef',
    blue: '#0000ff',
    tol_light_blue: '#77aadd',
    cadetblue: '#5a9ea5',
    cyan: '#00ffff',
    lightgray: '#d6d6d6',
    tol_light_gray: '#dddddd',
    white: '#ffffff',
};

/** The concrete color of a DotColor under a palette (Magic and unknown names map to black). */
export function dotColorToCss(color: DotColor, palette: DotPalette): string {
    const names = COLOR_NAMES[color];
    const name = names[DOT_PALETTES.indexOf(palette)] ?? names[0];
    return RGB[name] ?? '#000000';
}

/** Colors assigned in order to relations/types whose color is "Magic" (StaticGraphMaker). */
export const MAGIC_PALETTES: Record<DotPalette, string[]> = {
    Classic: ['#e41a1c', '#a65628', '#ff7f00', '#4daf4a', '#377eb8', '#984ea3'],
    Standard: ['#e31a1c', '#ff7f00', '#c87b7a', '#33a02c', '#1f78b4'],
    Martha: ['#e78ac3', '#fc8d62', '#a6d854', '#66c2a5', '#8da0cb'],
    Neon: ['#e7298a', '#d95f02', '#a6761d', '#66a61e', '#1b9e77', '#7570b3'],
    Tol: ['#77aadd', '#99ddff', '#bbcc33', '#aaaa00', '#ee8866', '#ffaabb', '#dddddd'],
};

export const isDotColor = (x: unknown): x is DotColor => DOT_COLORS.includes(x as DotColor);
export const isDotShape = (x: unknown): x is DotShape => DOT_SHAPES.includes(x as DotShape);
export const isDotStyle = (x: unknown): x is DotStyle => DOT_STYLES.includes(x as DotStyle);
export const isDotPalette = (x: unknown): x is DotPalette => DOT_PALETTES.includes(x as DotPalette);
