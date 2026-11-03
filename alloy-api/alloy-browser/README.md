# In-browser Alloy engine

Compiles the Alloy Analyzer to **WebAssembly GC** (plus a **JavaScript** fallback) with
[TeaVM](https://teavm.org), so the playground can run Alloy analyses in the user's browser instead
of on the server.

```
alloy-api/
├── alloy-engine/    plain-Java analysis core (parse, solve, next, eval, redundancy → JSON)
│                    used by BOTH the Spring API and this module
├── alloy-browser/   TeaVM entry point + compiler plugin  ──►  frontend/public/engines/alloy/
└── src/             Spring Boot API (thin REST adapters around alloy-engine)
```

The server and the browser execute **the same Java code** and return **the same JSON**, so the
frontend can switch between them (`VITE_ALLOY_EXECUTION_MODE`, see
`frontend/tools/alloy/engine/README.md`). Differences are limited to policies injected into
`AlloyEngine`:

|                     | Server (Spring)                 | Browser (TeaVM)                         |
|---------------------|---------------------------------|-----------------------------------------|
| SAT solver          | MiniSat (native) or SAT4J       | SAT4J (pure Java)                       |
| Timeouts            | `TimedAnalysisRunner`, 60 s     | page terminates the Web Worker          |
| Solution store      | 10 000 entries, 1 h idle expiry | 20 entries per tab                      |
| UNSAT-core features | `/redundancy/explainNative`     | not available (needs native MiniSat)   |

## Building

Requires JDK 17+ and, for the parity check, Node.js 22+.

```bash
cd alloy-api
./gradlew :alloy-browser:installToFrontend   # build + copy to frontend/public/engines/alloy
./gradlew :alloy-browser:parityCheck         # compiled engines must match the JVM (see below)
./gradlew :alloy-browser:installToFrontend -PalloyBrowserDebug   # readable output for debugging
```

`installToFrontend` writes `manifest.json` (API version + content hash). The worker loads assets
with `?v=<hash>`, so a new build is never served from a stale cache. The generated files are
committed because the frontend image is built without a JDK; **re-run `installToFrontend` whenever
`alloy-engine`, this module or `lib/org.alloytools.alloy.dist.jar` change.**

Typical sizes: `alloy-engine.wasm` 2.9 MB (0.8 MB gzip), `alloy-engine.js` 1.4 MB (0.4 MB gzip).
Both are downloaded lazily, on the first Alloy run.

The assets live under `/engines/alloy/` on purpose: the Vite proxy key `/alloy` (→ Alloy API) is a
prefix match and would capture any path starting with `/alloy`.

## How the compilation works

TeaVM translates bytecode, so the Alloy distribution JAR is used as is; only reachable code is
compiled. Two kinds of compile-time patches (`de.buw.fmp.alloy.browser.teavm`, registered as a
TeaVM plugin) make it work:

* **`BrowserStubs`** replaces method bodies that are never executed in the browser but reference
  JDK APIs TeaVM lacks: decomposed (multi-threaded) solving, native solver loading, temp-file dumps,
  JAR-manifest lookup, slf4j binding discovery.
* **`ClasslibFixes`** corrects bugs in TeaVM's class library that change results. Currently one:
  `LinkedList.listIterator().remove()` corrupts the list after removing its last element, which
  broke Kodkod's symmetry detection (every analysis failed with an `AssertionError`).

`org.teavm.classlib.java.lang.TUnsatisfiedLinkError` supplies a JDK class TeaVM does not emulate.

## Parity check (do not skip on upgrades)

TeaVM re-implements the Java class library, and a subtle difference can silently change analysis
results. `alloy-engine`'s `ServerParityTest` therefore

1. compares the engine with the original server pipeline on ~60 models (Alloy's book examples +
   temporal/ordering/redundancy models), and
2. exports the expected results to `alloy-engine/build/parity/fixtures.json`.

`parityCheck` replays those fixtures (first instance, next instance, evaluation, redundancy)
against the compiled WasmGC and JS engines and fails on any difference.

## Upgrading Alloy or TeaVM

1. Replace the JAR / bump `teavm` in `build.gradle`.
2. `./gradlew :alloy-browser:buildWasmGC`. For each new "… was not found" error, check that the
   code path is unreachable in the browser and add a `BrowserStubs` entry.
3. `./gradlew :alloy-browser:parityCheck` must report all fixtures matching. Investigate any
   mismatch with `node --liftoff-only scripts/parity-check.mjs <fixtures> --wasm <dir> --verbose` and a
   `-PalloyBrowserDebug` build. When TeaVM fixes a bug upstream, drop the `ClasslibFixes` entry.
4. `./gradlew :alloy-browser:installToFrontend` and commit `frontend/public/engines/alloy/`.
5. If the exported functions in `AlloyBrowserMain` change, bump `API_VERSION` there and
   `ENGINE_API_VERSION` in `frontend/tools/alloy/engine/browser/protocol.ts`.
