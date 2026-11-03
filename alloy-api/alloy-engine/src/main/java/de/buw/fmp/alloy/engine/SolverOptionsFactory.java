package de.buw.fmp.alloy.engine;

import edu.mit.csail.sdg.translator.A4Options;
import kodkod.engine.satlab.SATFactory;

/**
 * Creates the {@link A4Options} (most importantly the SAT solver) for each analysis.
 *
 * <p>The server can use native solvers such as MiniSat, whereas the browser build is restricted to
 * pure-Java solvers. Injecting this factory keeps that choice out of the analysis code.
 */
@FunctionalInterface
public interface SolverOptionsFactory {

  /**
   * Pure-Java SAT4J, which works on every platform. It deliberately avoids {@link
   * SATFactory#find(String)}, which relies on {@code ServiceLoader} and native library probing.
   */
  SolverOptionsFactory SAT4J =
      () -> {
        A4Options options = new A4Options();
        options.solver = SATFactory.DEFAULT;
        return options;
      };

  A4Options create();
}
