package de.buw.fmp.alloy.browser.teavm;

import java.util.List;

/**
 * Methods of the Alloy/Kodkod/slf4j bytecode that cannot work in a browser and are replaced at
 * compile time.
 *
 * <p>Every entry is on a code path the browser engine never executes (native SAT solvers,
 * decomposed multi-threaded solving, file output, logging back-end discovery). Their original
 * bodies reference JDK APIs that TeaVM does not provide ({@code java.util.concurrent} executors,
 * {@code System.load}, {@code Runtime.addShutdownHook}, {@code ClassLoader.getResources}, ...),
 * which would otherwise fail the build.
 *
 * <p>Keep this list minimal; when upgrading Alloy, run the TeaVM build and add entries only for
 * newly reported "was not found" errors that are provably unreachable.
 */
final class BrowserStubs {

  private BrowserStubs() {}

  static final List<MethodPatch> PATCHES =
      List.of(
          // -- Decomposed (parallel) solving needs thread pools. decompose_mode stays 0. -------
          MethodPatch.unsupported(
              "kodkod.engine.DecomposedPardinusSolver", "solve", "Decomposed solving"),
          MethodPatch.unsupported(
              "kodkod.engine.DecomposedPardinusSolver$DSolutionIterator",
              "<init>",
              "Decomposed solving"),
          MethodPatch.unsupported("kodkod.engine.DProblemExecutor", "<init>", "Decomposed solving"),
          MethodPatch.unsupported("kodkod.engine.DProblemExecutor", "terminate", "Decomposed solving"),
          MethodPatch.unsupported(
              "kodkod.engine.DProblemExecutorImpl", "<init>", "Decomposed solving"),
          MethodPatch.unsupported(
              "kodkod.engine.DProblemExecutorImpl", "launchBatch", "Decomposed solving"),

          // -- Native SAT solvers (JNI / external processes). Only SAT4J is used. --------------
          // NativeCode's static initializer registers a shutdown hook; with an empty initializer
          // NativeCode.platform stays null, which SATFactory reports as "solver not present".
          MethodPatch.noop("kodkod.solvers.api.NativeCode", "<clinit>"),
          MethodPatch.noop("kodkod.solvers.api.NativeCode", "close"),
          MethodPatch.unsupported(
              "kodkod.engine.satlab.SATFactory", "loadLibrary", "Native SAT solvers"),

          // -- Writing CNF/Kodkod dumps to temporary files (recordKodkod, CNF "solvers"). ------
          MethodPatch.unsupported(
              "edu.mit.csail.sdg.translator.A4Options", "tempFile", "Temporary files"),

          // -- Version info comes from the JAR manifest; Version falls back to "unknown". ------
          MethodPatch.returnNull("edu.mit.csail.sdg.alloy4.Version", "getManifest"),

          // -- slf4j binding discovery (class path scanning, SecurityManager). Log to nowhere. --
          MethodPatch.noop("org.slf4j.LoggerFactory", "<clinit>"),
          MethodPatch.returnStaticField(
              "org.slf4j.LoggerFactory",
              "getLogger",
              "org.slf4j.helpers.NOPLogger",
              "NOP_LOGGER"));
}
