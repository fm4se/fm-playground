/// <reference lib="webworker" />
/**
 * Web Worker hosting the TeaVM-compiled Alloy engine (`alloy-api/alloy-browser`).
 *
 * SAT solving is synchronous and can take long, so it must never run on the page's main thread.
 * The page enforces timeouts by terminating this worker.
 */
import { supportsWasmGC } from './capabilities';
import {
    ENGINE_API_VERSION,
    type CallMessage,
    type CompiledAlloyEngine,
    type EngineManifest,
    type FromWorker,
    type InitMessage,
    type LoadedBackend,
    type ToWorker,
} from './protocol';

declare const self: DedicatedWorkerGlobalScope;

interface LoadedEngine {
    exports: CompiledAlloyEngine;
    backend: LoadedBackend;
}

let init: InitMessage | null = null;
let engine: Promise<LoadedEngine> | null = null;

async function fetchManifest(baseUrl: string): Promise<EngineManifest> {
    const response = await fetch(new URL('manifest.json', baseUrl), { cache: 'no-cache' });
    if (!response.ok) {
        throw new Error(`Alloy engine manifest not found (${response.status}). Run the installToFrontend task.`);
    }
    const manifest: EngineManifest = await response.json();
    if (manifest.apiVersion !== ENGINE_API_VERSION) {
        throw new Error(`Alloy engine API ${manifest.apiVersion} does not match the UI (${ENGINE_API_VERSION}).`);
    }
    return manifest;
}

/** Versioned URL, so a new engine build is never served from a stale cache. */
function assetUrl(baseUrl: string, file: string, manifest: EngineManifest): string {
    const url = new URL(file, baseUrl);
    url.searchParams.set('v', manifest.contentHash);
    return url.href;
}

async function loadWasmGC(baseUrl: string, manifest: EngineManifest): Promise<LoadedEngine> {
    const runtime = await import(/* @vite-ignore */ assetUrl(baseUrl, manifest.wasmRuntime, manifest));
    const teavm = await runtime.load(assetUrl(baseUrl, manifest.wasm, manifest));
    return { exports: teavm.exports as CompiledAlloyEngine, backend: 'wasm-gc' };
}

async function loadJs(baseUrl: string, manifest: EngineManifest): Promise<LoadedEngine> {
    const module = await import(/* @vite-ignore */ assetUrl(baseUrl, manifest.js, manifest));
    return { exports: module as CompiledAlloyEngine, backend: 'js' };
}

async function loadEngine({ assetBaseUrl, backend }: InitMessage): Promise<LoadedEngine> {
    const manifest = await fetchManifest(assetBaseUrl);
    if (backend !== 'js' && supportsWasmGC()) {
        try {
            return await loadWasmGC(assetBaseUrl, manifest);
        } catch (error) {
            if (backend === 'wasm-gc') throw error;
            console.warn('[alloy-engine] WebAssembly GC engine failed to load, using JavaScript build', error);
        }
    } else if (backend === 'wasm-gc') {
        throw new Error('This browser does not support WebAssembly GC.');
    }
    return loadJs(assetBaseUrl, manifest);
}

function reply(message: FromWorker) {
    self.postMessage(message);
}

async function call({ id, method, args }: CallMessage) {
    try {
        if (!init) throw new Error('Alloy engine worker was not initialised.');
        engine ??= loadEngine(init);
        const loaded = await engine;
        const fn = loaded.exports[method] as (...a: Array<string | number>) => string;
        reply({ kind: 'result', id, json: fn(...args), backend: loaded.backend });
    } catch (error) {
        // Either loading failed or the compiled Java code threw (e.g. out of memory). Both mean the
        // engine is unusable; the page discards this worker.
        reply({ kind: 'failure', id, message: error instanceof Error ? error.message : String(error) });
    }
}

// Messages are handled strictly in order: a call waits for the previous one to finish.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ToWorker>) => {
    const message = event.data;
    if (message.kind === 'init') {
        init = message;
        return;
    }
    queue = queue.then(() => call(message));
};
