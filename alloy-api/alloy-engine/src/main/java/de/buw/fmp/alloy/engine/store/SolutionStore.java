package de.buw.fmp.alloy.engine.store;

import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.translator.A4Solution;
import java.util.Optional;

/**
 * Keeps solutions addressable by an opaque {@code specId}, so that clients can request the next
 * instance or evaluate expressions later.
 */
public interface SolutionStore {

  /** Stores a new solution and returns its freshly generated id. */
  String add(CompModule module, A4Solution solution);

  /** Looks up a solution and marks it as recently used. */
  Optional<StoredSolution> get(String specId);

  /** Current time according to the store's clock (used to timestamp updates). */
  long now();

  /** Removes every entry that has not been used for more than {@code maxIdleMillis}. */
  void evictIdle(long maxIdleMillis);

  int size();
}
