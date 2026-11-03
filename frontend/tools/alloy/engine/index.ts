/**
 * Alloy execution engines.
 *
 * ```ts
 * import { getAlloyEngine } from '@/../tools/alloy/engine';
 * const instance = await getAlloyEngine().findInstance({ code, permalink, cmd: 0 });
 * ```
 *
 * Switch between in-browser and server-side execution with `VITE_ALLOY_EXECUTION_MODE`
 * (`auto` | `browser` | `server`) at build time, or per browser with
 * `localStorage.setItem('fmp.alloy.executionMode', 'server')`. See ./README.md.
 */
import { BrowserAlloyEngine } from './browser/browserEngine';
import { supportsBrowserEngine } from './browser/capabilities';
import { resolveAlloyEngineConfig, type AlloyEngineConfig } from './config';
import { HybridAlloyEngine } from './hybridEngine';
import { ServerAlloyEngine } from './serverEngine';
import type { AlloyEngine } from './types';

export type { AlloyEngine, AlloyInstanceRequest, AlloyJson, AlloyEngineKind } from './types';
export { AlloyEngineUnavailableError } from './types';
export type { AlloyEngineConfig, AlloyExecutionMode, AlloyBrowserBackend } from './config';
export { resolveAlloyEngineConfig, STORAGE_KEYS } from './config';

export function createAlloyEngine(config: AlloyEngineConfig): AlloyEngine {
    const server = new ServerAlloyEngine();
    switch (config.mode) {
        case 'server':
            return server;
        case 'browser':
            return new BrowserAlloyEngine(config);
        case 'auto':
        default:
            return supportsBrowserEngine() ? new HybridAlloyEngine(new BrowserAlloyEngine(config), server) : server;
    }
}

let engine: AlloyEngine | null = null;

/** The engine selected by the current configuration (created on first use). */
export function getAlloyEngine(): AlloyEngine {
    if (!engine) {
        const config = resolveAlloyEngineConfig();
        engine = createAlloyEngine(config);
        console.info(`[alloy-engine] execution mode: ${config.mode} (${engine.kind})`);
    }
    return engine;
}
