package de.buw.fmp.alloy.engine.store;

import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.translator.A4Solution;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * Thread-safe, bounded, in-memory {@link SolutionStore}.
 *
 * <p>Entries are kept in access order. When {@code maxEntries} is exceeded the least recently used
 * entry is dropped, which bounds memory use (important inside a browser tab).
 */
public final class InMemorySolutionStore implements SolutionStore {

  /** Same id format the API has always used: random 64-bit hex. */
  public static final Supplier<String> RANDOM_HEX_IDS =
      () -> Long.toHexString(Double.doubleToLongBits(Math.random()));

  private final int maxEntries;
  private final LongSupplier clock;
  private final Supplier<String> idGenerator;
  private final LinkedHashMap<String, StoredSolution> entries;

  public InMemorySolutionStore(int maxEntries) {
    this(maxEntries, System::currentTimeMillis, RANDOM_HEX_IDS);
  }

  public InMemorySolutionStore(int maxEntries, LongSupplier clock, Supplier<String> idGenerator) {
    if (maxEntries < 1) {
      throw new IllegalArgumentException("maxEntries must be positive");
    }
    this.maxEntries = maxEntries;
    this.clock = Objects.requireNonNull(clock);
    this.idGenerator = Objects.requireNonNull(idGenerator);
    this.entries = new LinkedHashMap<>(16, 0.75f, true);
  }

  @Override
  public synchronized String add(CompModule module, A4Solution solution) {
    String id;
    do {
      id = idGenerator.get();
    } while (entries.containsKey(id));
    entries.put(id, new StoredSolution(module, solution, clock.getAsLong()));
    while (entries.size() > maxEntries) {
      Iterator<String> eldest = entries.keySet().iterator();
      eldest.next();
      eldest.remove();
    }
    return id;
  }

  @Override
  public synchronized Optional<StoredSolution> get(String specId) {
    StoredSolution stored = specId == null ? null : entries.get(specId);
    if (stored != null) {
      stored.touch(clock.getAsLong());
    }
    return Optional.ofNullable(stored);
  }

  @Override
  public long now() {
    return clock.getAsLong();
  }

  @Override
  public synchronized void evictIdle(long maxIdleMillis) {
    long cutoff = clock.getAsLong() - maxIdleMillis;
    Iterator<Map.Entry<String, StoredSolution>> it = entries.entrySet().iterator();
    while (it.hasNext()) {
      if (it.next().getValue().lastAccessed() < cutoff) {
        it.remove();
      }
    }
  }

  @Override
  public synchronized int size() {
    return entries.size();
  }
}
