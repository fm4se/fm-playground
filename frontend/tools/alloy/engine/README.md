# Alloy execution engines

Alloy analyses (find instance, next instance, evaluate, maximal redundant set, explain redundancy)
can run **in the user's browser** or **on the Alloy API**. The UI talks to one interface,
`AlloyEngine`, and does not know which one it got.

```
getAlloyEngine()
  ├─ ServerAlloyEngine    HTTP → /alloy/... (Spring API)
  ├─ BrowserAlloyEngine   Web Workers running the TeaVM-compiled Java engine
  │     ├─ "alloy-instances" worker: find / next / evaluate
  │     └─ "alloy-analyses"  worker: redundancy (never blocks "Next instance")
  └─ HybridAlloyEngine    browser first, server only if the browser engine cannot run
```

Both sides execute the same Java code (`alloy-api/alloy-engine`) and return the same JSON, so
switching is transparent. See `alloy-api/alloy-browser/README.md` for how the engine is built.

## Switching between browser and server

| Setting (build time)             | Values                      | Default  |
|----------------------------------|-----------------------------|----------|
| `VITE_ALLOY_EXECUTION_MODE`      | `auto`, `browser`, `server` | `auto`   |
| `VITE_ALLOY_BROWSER_BACKEND`     | `auto`, `wasm-gc`, `js`     | `auto`   |
| `VITE_ALLOY_BROWSER_TIMEOUT_MS`  | ms, find/next/evaluate      | `120000` |
| `VITE_ALLOY_ANALYSIS_TIMEOUT_MS` | ms, redundancy analyses     | `300000` |

* `auto`: run in the browser and fall back to the server when the browser engine is
  unavailable (no Web Workers, download failed, worker crashed). Analysis errors and timeouts are
  **not** retried on the server.
* `browser`: browser only (no server load at all).
* `server`: the previous, fully server-side behaviour. Set
  `VITE_ALLOY_EXECUTION_MODE=server` (e.g. as a Docker build arg) to switch back.

Per-browser overrides for debugging or comparisons, in the dev-tools console:

```js
localStorage.setItem('fmp.alloy.executionMode', 'server'); // or 'browser' / 'auto'
localStorage.setItem('fmp.alloy.browserBackend', 'js');    // force the JavaScript build
location.reload();
```

The active mode is logged once: `[alloy-engine] execution mode: auto (hybrid)`.

## Behaviour notes

* **Timeouts** terminate the worker (SAT solving cannot be interrupted otherwise) and are reported
  in-band like on the server: `{ error: 'Analysis timed out after N seconds.', status: 400 }`. The
  next call starts a fresh worker; earlier `specId`s are then unknown ("No instance found, possibly
  cleaned up…"), exactly as after server-side cleanup.
* **Follow-up calls** (`nextInstance`, `evaluate`) are routed to the engine that created the
  `specId`, even if the hybrid engine fell back in between.
* The engine (~0.8 MB gzip) is downloaded on the **first Alloy run**, not on page load. WebAssembly GC
  needs Chrome/Edge 119+, Firefox 120+ or Safari 18.2+; older browsers get the JavaScript build.
* The browser uses SAT4J, which is slower than the server's native MiniSat on large models, but the
  work happens on the user's machine without blocking the page.
* `explainNative` (UNSAT-core based) is server-only and not used by the UI.

## Files

| File                          | Responsibility                                             |
|-------------------------------|------------------------------------------------------------|
| `types.ts`                    | `AlloyEngine` contract, `AlloyEngineUnavailableError`       |
| `config.ts`                   | env + localStorage → `AlloyEngineConfig`                    |
| `index.ts`                    | factory and the `getAlloyEngine()` singleton               |
| `serverEngine.ts`             | REST calls to the Alloy API                                |
| `hybridEngine.ts`             | fallback and `specId` routing                              |
| `browser/browserEngine.ts`    | maps operations to the two workers, timeouts → in-band error |
| `browser/workerClient.ts`     | worker lifecycle, request correlation, termination         |
| `browser/alloy.worker.ts`     | loads `manifest.json`, picks WasmGC or JS, runs calls      |
| `browser/protocol.ts`         | page ↔ worker messages, compiled engine API version        |
