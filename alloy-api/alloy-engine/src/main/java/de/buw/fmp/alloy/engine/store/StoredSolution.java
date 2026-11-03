package de.buw.fmp.alloy.engine.store;

import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.translator.A4Solution;

/**
 * The state needed to continue working with a solution: enumerate further instances and evaluate
 * expressions against it.
 */
public final class StoredSolution {
  private final CompModule module;
  private volatile A4Solution solution;
  private volatile long lastAccessed;

  public StoredSolution(CompModule module, A4Solution solution, long now) {
    this.module = module;
    this.solution = solution;
    this.lastAccessed = now;
  }

  public CompModule module() {
    return module;
  }

  public A4Solution solution() {
    return solution;
  }

  /** Replaces the current solution (after {@code next()}) and marks the entry as used. */
  public void update(A4Solution next, long now) {
    this.solution = next;
    this.lastAccessed = now;
  }

  public long lastAccessed() {
    return lastAccessed;
  }

  void touch(long now) {
    this.lastAccessed = now;
  }
}
