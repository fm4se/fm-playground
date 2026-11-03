import type { AlloyBrowserBackend } from './browser/protocol';

/**
 * Where Alloy analyses run.
 *
 * - `auto`    (default) in the browser; falls back to the server if the browser engine is
 *             unavailable (old browser, failed download, crashed worker).
 * - `browser` in the browser only.
 * - `server`  on the Alloy API only (the behaviour before the browser engine existed).
 */
export type AlloyExecutionMode = 'auto' | 'browser' | 'server';

export type { AlloyBrowserBackend };

export interface AlloyEngineConfig {
    mode: AlloyExecutionMode;
    browserBackend: AlloyBrowserBackend;
    /** Limit for finding/enumerating instances in the browser (the server uses 60 s). */
    instanceTimeoutMs: number;
    /** Limit for redundancy analyses in the browser. */
    analysisTimeoutMs: number;
    /** Absolute URL of the directory holding `manifest.json` and the compiled engine. */
    assetBaseUrl: string;
}

/** Per-browser overrides, e.g. `localStorage.setItem('fmp.alloy.executionMode', 'server')`. */
export const STORAGE_KEYS = {
    mode: 'fmp.alloy.executionMode',
    browserBackend: 'fmp.alloy.browserBackend',
} as const;

const MODES: readonly AlloyExecutionMode[] = ['auto', 'browser', 'server'];
const BACKENDS: readonly AlloyBrowserBackend[] = ['auto', 'wasm-gc', 'js'];

const DEFAULTS = {
    mode: 'auto' as AlloyExecutionMode,
    browserBackend: 'auto' as AlloyBrowserBackend,
    instanceTimeoutMs: 120_000,
    analysisTimeoutMs: 300_000,
};

type Env = Record<string, string | boolean | undefined>;

function pick<T extends string>(allowed: readonly T[], ...candidates: unknown[]): T | undefined {
    for (const c of candidates) {
        const value = typeof c === 'string' ? c.trim().toLowerCase() : undefined;
        if (value && (allowed as readonly string[]).includes(value)) return value as T;
    }
    return undefined;
}

function positiveInt(value: unknown, fallback: number): number {
    const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readStorage(key: string): string | null {
    try {
        return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
        return null; // storage disabled (privacy mode, sandboxed iframe, ...)
    }
}

/**
 * Resolves the configuration from build-time variables (`VITE_ALLOY_*`), with optional per-browser
 * overrides from localStorage (handy for debugging and A/B comparisons).
 *
 * | Variable                        | Values                         | Default |
 * |---------------------------------|--------------------------------|---------|
 * | VITE_ALLOY_EXECUTION_MODE       | auto, browser, server          | auto    |
 * | VITE_ALLOY_BROWSER_BACKEND      | auto, wasm-gc, js              | auto    |
 * | VITE_ALLOY_BROWSER_TIMEOUT_MS   | milliseconds                   | 120000  |
 * | VITE_ALLOY_ANALYSIS_TIMEOUT_MS  | milliseconds                   | 300000  |
 */
export function resolveAlloyEngineConfig(env: Env = import.meta.env): AlloyEngineConfig {
    const base = typeof env.BASE_URL === 'string' ? env.BASE_URL : '/';
    const origin = globalThis.location?.href ?? 'http://localhost/';
    return {
        mode: pick(MODES, readStorage(STORAGE_KEYS.mode), env.VITE_ALLOY_EXECUTION_MODE) ?? DEFAULTS.mode,
        browserBackend:
            pick(BACKENDS, readStorage(STORAGE_KEYS.browserBackend), env.VITE_ALLOY_BROWSER_BACKEND) ??
            DEFAULTS.browserBackend,
        instanceTimeoutMs: positiveInt(env.VITE_ALLOY_BROWSER_TIMEOUT_MS, DEFAULTS.instanceTimeoutMs),
        analysisTimeoutMs: positiveInt(env.VITE_ALLOY_ANALYSIS_TIMEOUT_MS, DEFAULTS.analysisTimeoutMs),
        assetBaseUrl: new URL(`${base.replace(/\/?$/, '/')}engines/alloy/`, origin).href,
    };
}
