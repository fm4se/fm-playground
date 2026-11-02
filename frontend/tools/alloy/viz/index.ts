/**
 * Alloy instance visualizer: a TypeScript port of the Alloy Analyzer's
 * visualizer (alloy4viz + alloy4graph).
 *
 * core/        framework-free logic: instance model, reader, projection, theme,
 *              Magic Layout, .thm files, the layered graph layout engine
 * components/  React UI: the visualizer, graph canvas, theme editor, tree view
 */
export { default as AlloyVisualizer } from './components/AlloyVisualizer';
export { default as InstanceTree } from './components/InstanceTree';
export { readAlloyTrace, hasAlloySolution, normalizeState } from './core/reader';
export type { AlloyTrace } from './core/reader';
