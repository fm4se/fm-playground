/**
 * Smallest module using a GC struct type: (type (struct (field i8))). Same probe as the
 * wasm-feature-detect library.
 */
const WASM_GC_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0]);

/** WebAssembly GC: Chrome/Edge 119+, Firefox 120+, Safari 18.2+. */
export function supportsWasmGC(): boolean {
    try {
        return typeof WebAssembly === 'object' && WebAssembly.validate(WASM_GC_PROBE);
    } catch {
        return false;
    }
}

/**
 * Cheap pre-check for the browser engine. Module workers are available in every browser that
 * runs the playground; if starting one still fails, the worker reports an error at run time and
 * the hybrid engine falls back to the server.
 */
export function supportsBrowserEngine(): boolean {
    return typeof Worker !== 'undefined';
}
