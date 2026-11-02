/**
 * Persists visualizer themes in localStorage, one per model "signature"
 * (its user sigs and relations), so customizations survive re-running a model.
 */
import { AlloyModel } from './model';
import { VizTheme } from './theme';

const PREFIX = 'alloy-viz-theme:';
const INDEX_KEY = 'alloy-viz-theme-index';
const MAX_THEMES = 50;

/** Identifies a model by the names of its non-builtin sigs and its relations. */
export function modelSignature(model: AlloyModel): string {
    const parts = [
        ...model.types.filter((t) => !t.isBuiltin).map((t) => t.key),
        ...model.relations.map((r) => r.key),
    ].sort();
    let hash = 5381;
    for (const ch of parts.join('|')) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
    return hash.toString(36);
}

export function loadTheme(signature: string): VizTheme | null {
    try {
        const raw = localStorage.getItem(PREFIX + signature);
        return raw ? VizTheme.fromJSON(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

export function saveTheme(signature: string, theme: VizTheme): void {
    try {
        localStorage.setItem(PREFIX + signature, JSON.stringify(theme.toJSON()));
        const index: string[] = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]').filter(
            (s: string) => s !== signature
        );
        index.push(signature);
        for (const old of index.splice(0, Math.max(0, index.length - MAX_THEMES)))
            localStorage.removeItem(PREFIX + old);
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
        // Storage may be unavailable (private mode, quota); themes then last for the session only.
    }
}

export function forgetTheme(signature: string): void {
    try {
        localStorage.removeItem(PREFIX + signature);
    } catch {
        // ignore
    }
}
