package de.buw.fmp.alloy.api;

import de.buw.fmp.alloy.engine.AlloyEngine;
import de.buw.fmp.alloy.engine.store.InMemorySolutionStore;

/** Controller that resolves "permalinks" to {@link Specs} instead of calling the backend. */
public class AlloyInstanceControllerLocal extends AlloyInstanceController {

  final TimedAnalysisRunner runner;
  final AlloyEngine engine;

  AlloyInstanceControllerLocal(int timeoutSeconds, int maxConcurrent) {
    this(new TimedAnalysisRunner(timeoutSeconds, maxConcurrent));
  }

  private AlloyInstanceControllerLocal(TimedAnalysisRunner runner) {
    this(runner, engineWith(runner));
  }

  private AlloyInstanceControllerLocal(TimedAnalysisRunner runner, AlloyEngine engine) {
    super(engine);
    this.runner = runner;
    this.engine = engine;
  }

  private static AlloyEngine engineWith(TimedAnalysisRunner runner) {
    return AlloyEngine.builder()
        .solverOptions(AlloyEngineConfiguration.SERVER_SOLVER)
        .solutionStore(new InMemorySolutionStore(100))
        .instanceRunner(runner)
        .build();
  }

  @Override
  public String getCodeByPermalink(String type, String permalink) {
    return Specs.valueOf(permalink).code;
  }

  public String getInstance(Specs spec, int index) {
    return super.getInstance("ALS", spec.name(), index);
  }
}
