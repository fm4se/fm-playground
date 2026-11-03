package de.buw.fmp.alloy.engine;

import de.buw.fmp.alloy.engine.instance.InstanceService;
import de.buw.fmp.alloy.engine.redundancy.RedundancyService;
import de.buw.fmp.alloy.engine.store.InMemorySolutionStore;
import de.buw.fmp.alloy.engine.store.SolutionStore;
import java.util.Objects;

/**
 * Host-independent entry point to all Alloy analyses offered by the playground.
 *
 * <p>Every operation takes plain strings and returns a JSON document as a string. That document
 * is the wire format of the REST API <em>and</em> of the in-browser engine, so the frontend can
 * switch between server-side and client-side execution without noticing a difference.
 *
 * <p>Errors are reported in-band as {@code {"error": "...", "status": 400}}; no method throws.
 *
 * <pre>{@code
 * AlloyEngine engine = AlloyEngine.builder()
 *     .solverOptions(SolverOptionsFactory.SAT4J)
 *     .instanceRunner(myTimeoutRunner)
 *     .build();
 * String json = engine.findInstance(code, 0);
 * }</pre>
 */
public final class AlloyEngine {

  private final SolutionStore solutionStore;
  private final InstanceService instances;
  private final RedundancyService redundancy;

  private AlloyEngine(Builder b) {
    this.solutionStore = b.solutionStore;
    this.instances = new InstanceService(b.solverOptions, b.solutionStore, b.instanceRunner);
    this.redundancy = new RedundancyService(b.solverOptions, b.redundancyRunner);
  }

  public static Builder builder() {
    return new Builder();
  }

  /** Executes command {@code cmd} (0-based) of {@code code} and returns the first instance. */
  public String findInstance(String code, int cmd) {
    return instances.findInstance(code, cmd).toString();
  }

  /** Returns the next instance for a {@code specId} obtained from {@link #findInstance}. */
  public String nextInstance(String specId) {
    return instances.nextInstance(specId).toString();
  }

  /** Evaluates {@code expr} against the current instance of {@code specId} in {@code state}. */
  public String evaluate(String specId, String expr, int state) {
    return instances.evaluate(specId, expr, state).toString();
  }

  /** Maximal redundant set of constraints; {@code cmdId == -1} checks all commands. */
  public String maxRedundantSet(String code, int cmdId) {
    return redundancy.maxRedundantSet(code, cmdId).toString();
  }

  /** Explains the redundancy of the constraint at the 1-based character offset {@code cursorPos}. */
  public String explainRedundancyAtCursor(String code, int cursorPos) {
    return redundancy.explainAtCursor(code, cursorPos).toString();
  }

  /** Explains the redundancy of constraint {@code constraintId} for command {@code cmdId}. */
  public String explainRedundancy(String code, int cmdId, int constraintId) {
    return redundancy.explainConstraint(code, cmdId, constraintId).toString();
  }

  /** The store holding solutions for {@link #nextInstance} / {@link #evaluate}. */
  public SolutionStore solutionStore() {
    return solutionStore;
  }

  /** Configures an {@link AlloyEngine}. All settings have portable defaults. */
  public static final class Builder {
    private SolverOptionsFactory solverOptions = SolverOptionsFactory.SAT4J;
    private SolutionStore solutionStore;
    private AnalysisRunner instanceRunner = AnalysisRunner.DIRECT;
    private AnalysisRunner redundancyRunner = AnalysisRunner.DIRECT;

    private Builder() {}

    /** Solver selection; defaults to pure-Java SAT4J. */
    public Builder solverOptions(SolverOptionsFactory solverOptions) {
      this.solverOptions = Objects.requireNonNull(solverOptions);
      return this;
    }

    /** Where solutions are kept between calls; defaults to 100 entries in memory. */
    public Builder solutionStore(SolutionStore solutionStore) {
      this.solutionStore = Objects.requireNonNull(solutionStore);
      return this;
    }

    /** Execution policy for finding/enumerating instances; defaults to {@link AnalysisRunner#DIRECT}. */
    public Builder instanceRunner(AnalysisRunner runner) {
      this.instanceRunner = Objects.requireNonNull(runner);
      return this;
    }

    /** Execution policy for redundancy analyses; defaults to {@link AnalysisRunner#DIRECT}. */
    public Builder redundancyRunner(AnalysisRunner runner) {
      this.redundancyRunner = Objects.requireNonNull(runner);
      return this;
    }

    public AlloyEngine build() {
      if (solutionStore == null) {
        solutionStore = new InMemorySolutionStore(100);
      }
      return new AlloyEngine(this);
    }
  }
}
