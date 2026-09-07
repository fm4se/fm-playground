package de.buw.fmp.alloy.api;

import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.translator.A4Solution;

public class StoredSolution {
  private A4Solution solution;
  private CompModule module;
  private long lastAccessed;

  public StoredSolution(CompModule module, A4Solution solution) {
    this.module = module;
    this.solution = solution;
    this.lastAccessed = System.currentTimeMillis();
  }

  public CompModule getModule() {
    return module;
  }

  public A4Solution getSolution() {
    return solution;
  }

  public void setSolution(A4Solution solution) {
    this.lastAccessed = System.currentTimeMillis();
    this.solution = solution;
  }

  public long getLastAccessed() {
    return lastAccessed;
  }

  public void setLastAccessed(long lastAccessed) {
    this.lastAccessed = lastAccessed;
  }
}
