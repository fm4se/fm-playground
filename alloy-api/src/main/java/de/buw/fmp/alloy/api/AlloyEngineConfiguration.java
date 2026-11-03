package de.buw.fmp.alloy.api;

import de.buw.fmp.alloy.engine.AlloyEngine;
import de.buw.fmp.alloy.engine.AnalysisRunner;
import de.buw.fmp.alloy.engine.SolverOptionsFactory;
import de.buw.fmp.alloy.engine.store.InMemorySolutionStore;
import edu.mit.csail.sdg.translator.A4Options;
import kodkod.engine.satlab.SATFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Wires the shared {@link AlloyEngine} with server-specific policies. The analysis logic itself
 * lives in {@code alloy-engine} and is identical to what the browser runs.
 */
@Configuration
public class AlloyEngineConfiguration {

  /** Native MiniSat when available (much faster), SAT4J otherwise. */
  public static final SolverOptionsFactory SERVER_SOLVER =
      () -> {
        A4Options options = new A4Options();
        options.solver = SATFactory.find("minisat").orElse(SATFactory.DEFAULT);
        return options;
      };

  @Bean
  public TimedAnalysisRunner instanceRunner(
      @Value("${alloy.analysis.timeout-seconds:60}") int timeoutSeconds,
      @Value("${alloy.analysis.max-concurrent:10}") int maxConcurrent) {
    return new TimedAnalysisRunner(timeoutSeconds, maxConcurrent);
  }

  @Bean
  public AlloyEngine alloyEngine(
      TimedAnalysisRunner instanceRunner,
      @Value("${alloy.solutions.max-stored:10000}") int maxStoredSolutions) {
    return AlloyEngine.builder()
        .solverOptions(SERVER_SOLVER)
        .solutionStore(new InMemorySolutionStore(maxStoredSolutions))
        .instanceRunner(instanceRunner)
        // Redundancy analyses have never been time-limited on the server; keep that behaviour.
        .redundancyRunner(AnalysisRunner.DIRECT)
        .build();
  }
}
