package de.buw.fmp.alloy.api;

import de.buw.fmp.alloy.engine.AnalysisRunner;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Server-side execution policy: every analysis runs on its own worker thread, is abandoned after
 * a timeout, and the number of concurrent analyses is capped to protect the server.
 */
public class TimedAnalysisRunner implements AnalysisRunner {

  private final int timeoutSeconds;
  private final int maxConcurrent;
  private final AtomicInteger running = new AtomicInteger();

  public TimedAnalysisRunner(int timeoutSeconds, int maxConcurrent) {
    this.timeoutSeconds = timeoutSeconds;
    this.maxConcurrent = maxConcurrent;
  }

  @Override
  public <T> T run(Task<T> task) throws Throwable {
    if (running.incrementAndGet() > maxConcurrent) {
      running.decrementAndGet();
      throw new RuntimeException("Too many instances running. Please try again later.");
    }
    try {
      Worker<T> worker = new Worker<>(task);
      Thread thread = new Thread(worker, "alloy-analysis");
      thread.setDaemon(true);
      thread.start();
      thread.join(timeoutSeconds * 1000L);
      if (thread.isAlive()) {
        thread.interrupt();
        throw new TimeoutException("Analysis timed out after " + timeoutSeconds + " seconds.");
      }
      if (worker.failure != null) {
        throw worker.failure;
      }
      return worker.result;
    } finally {
      running.decrementAndGet();
    }
  }

  /** Number of analyses currently executing (for monitoring and tests). */
  public int running() {
    return running.get();
  }

  private static final class Worker<T> implements Runnable {
    private final Task<T> task;
    private volatile T result;
    private volatile Throwable failure;

    Worker(Task<T> task) {
      this.task = task;
    }

    @Override
    public void run() {
      try {
        result = task.call();
      } catch (Throwable t) {
        failure = t;
      }
    }
  }
}
