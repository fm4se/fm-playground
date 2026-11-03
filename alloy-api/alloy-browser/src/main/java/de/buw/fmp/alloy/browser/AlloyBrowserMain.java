package de.buw.fmp.alloy.browser;

import de.buw.fmp.alloy.engine.AlloyEngine;
import de.buw.fmp.alloy.engine.SolverOptionsFactory;
import de.buw.fmp.alloy.engine.store.InMemorySolutionStore;
import java.io.OutputStream;
import java.io.PrintStream;
import org.teavm.jso.JSExport;

/**
 * TeaVM entry point: exposes {@link AlloyEngine} to JavaScript.
 *
 * <p>The compiled module is meant to run inside a dedicated Web Worker. Calls are synchronous and
 * may take long (SAT solving), so the worker—not this class—owns timeouts and cancellation (the
 * page simply terminates the worker). Every function returns the same JSON document as the
 * corresponding REST endpoint of the Alloy API.
 */
public final class AlloyBrowserMain {

  /** Bumped whenever the exported surface changes, so the JS side can detect stale builds. */
  private static final int API_VERSION = 1;

  /** Bounded to keep the memory footprint of a browser tab predictable. */
  private static final int MAX_STORED_SOLUTIONS = 20;

  private static final AlloyEngine ENGINE =
      AlloyEngine.builder()
          .solverOptions(SolverOptionsFactory.SAT4J)
          .solutionStore(new InMemorySolutionStore(MAX_STORED_SOLUTIONS))
          .build();

  static {
    // Parts of the analyzer print debug output to System.out, which TeaVM forwards to the browser
    // console (one console.log per line). Drop it; System.err (real problems) is kept.
    System.setOut(
        new PrintStream(
            new OutputStream() {
              @Override
              public void write(int b) {}

              @Override
              public void write(byte[] b, int off, int len) {}
            }));
  }

  private AlloyBrowserMain() {}

  /** Required by TeaVM; the module is driven through the exported functions below. */
  public static void main(String[] args) {}

  @JSExport
  public static int apiVersion() {
    return API_VERSION;
  }

  @JSExport
  public static String findInstance(String code, int cmd) {
    return ENGINE.findInstance(code, cmd);
  }

  @JSExport
  public static String nextInstance(String specId) {
    return ENGINE.nextInstance(specId);
  }

  @JSExport
  public static String evaluate(String specId, String expr, int state) {
    return ENGINE.evaluate(specId, expr, state);
  }

  @JSExport
  public static String maxRedundantSet(String code, int cmdId) {
    return ENGINE.maxRedundantSet(code, cmdId);
  }

  @JSExport
  public static String explainRedundancyAtCursor(String code, int cursorPos) {
    return ENGINE.explainRedundancyAtCursor(code, cursorPos);
  }
}
