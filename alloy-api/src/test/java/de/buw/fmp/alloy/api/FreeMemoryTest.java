package de.buw.fmp.alloy.api;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

public class FreeMemoryTest {

  @Test
  void freeMemoryTest() throws InterruptedException {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(10, 10);
    printMemoryUsage("before execution");
    String result = controller.getInstance(Specs.LONG_CODE, 0);
    printMemoryUsage("after timeout");
    assertTrue(result.contains("error") && result.contains("timed out"));
    System.gc();
    Thread.sleep(1000); // wait for gc
    printMemoryUsage("after gc");
  }

  private void printMemoryUsage(String when) {
    long mem = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory();
    System.out.println("Memory used: " + mem / 1024 / 1024 + " MB " + when);
  }
}
