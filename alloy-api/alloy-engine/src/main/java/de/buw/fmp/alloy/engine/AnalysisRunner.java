package de.buw.fmp.alloy.engine;

/**
 * Strategy that decides <em>how</em> a potentially long-running analysis task (SAT solving) is
 * executed.
 *
 * <p>The engine itself is single-threaded and synchronous. Hosts plug in their own policy:
 *
 * <ul>
 *   <li>the Spring API wraps tasks in a worker thread with a timeout and a concurrency limit;
 *   <li>the browser build runs tasks directly, because it already lives inside a Web Worker that
 *       the page can terminate.
 * </ul>
 */
public interface AnalysisRunner {

  /** Runs the task on the calling thread without any limits. */
  AnalysisRunner DIRECT =
      new AnalysisRunner() {
        @Override
        public <T> T run(Task<T> task) throws Throwable {
          return task.call();
        }
      };

  /**
   * Executes {@code task} and returns its result.
   *
   * @throws Throwable whatever the task throws, or a host-specific failure such as a timeout
   */
  <T> T run(Task<T> task) throws Throwable;

  /** A unit of analysis work. */
  @FunctionalInterface
  interface Task<T> {
    T call() throws Exception;
  }
}
