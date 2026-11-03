package de.buw.fmp.alloy.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ApplicationTests {

  @Autowired AlloyInstanceController wiredController;
  @Autowired RedundancyController wiredRedundancyController;

  @Test
  void contextLoads() {
    assertTrue(wiredController != null && wiredRedundancyController != null);
  }

  @Test
  void enumeratesAllInstances() throws Exception {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(5, 10);
    String result = controller.getInstance(Specs.SHORT_CODE, 0);
    assertTrue(result.contains("specId") && result.contains("alloy"));
    String specId = getField(result, "specId");

    List<String> instances = new ArrayList<>();
    instances.add(result);
    while (!result.contains("error")) {
      result = controller.getNextInstance(specId);
      assertFalse(instances.contains(result));
      instances.add(result);
    }
    assertTrue(instances.size() > 1);
  }

  @Test
  void longRunningCodeTimesOut() {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(1, 10);
    String result = controller.getInstance(Specs.LONG_CODE, 0);
    assertTrue(result.contains("error") && result.contains("timed out"), result);
    assertEquals(0, controller.runner.running());
  }

  @Test
  void shortRunningCodeIsFast() {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(5, 10);
    long start = System.currentTimeMillis();
    String result = controller.getInstance(Specs.SHORT_CODE, 0);
    assertTrue(System.currentTimeMillis() - start < 2000);
    assertFalse(result.contains("error"));
  }

  @Test
  void rejectsWorkBeyondConcurrencyLimit() throws Exception {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(3, 1);
    Thread busy = new Thread(() -> controller.getInstance(Specs.LONG_CODE, 0));
    busy.start();
    Thread.sleep(1000); // let the long analysis occupy the only slot
    assertEquals(1, controller.runner.running());

    String result = controller.getInstance(Specs.SHORT_CODE, 0);
    assertTrue(result.contains("error") && result.contains("Too many instances running."));

    busy.join();
    assertEquals(0, controller.runner.running());
    assertFalse(controller.getInstance(Specs.SHORT_CODE, 0).contains("error"));
  }

  @Test
  void runningCountIsReleasedAfterNextInstance() throws Exception {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(5, 10);
    String result = controller.getInstance(Specs.SHORT_CODE, 0);
    assertEquals(0, controller.runner.running());
    String specId = getField(result, "specId");
    assertFalse(controller.getNextInstance(specId).contains("error"));
    assertEquals(0, controller.runner.running());
  }

  @Test
  void evaluateListTest() throws Exception {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(60, 10);
    String specId = getField(controller.getInstance(Specs.LIST_CODE, 0), "specId");
    assertEquals("4", getField(controller.eval(specId, "# Node", 0), "result"));
    assertEquals("1", getField(controller.eval(specId, "# List", 0), "result"));
    assertEquals("1", getField(controller.eval(specId, "# Node", 1), "result"));
  }

  @Test
  void evaluateAtomTest() throws Exception {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(60, 10);
    String specId = getField(controller.getInstance(Specs.LIST_CODE, 0), "specId");
    assertEquals("{List$0}", getField(controller.eval(specId, "List", 0), "result"));
    assertEquals("{List$0}", getField(controller.eval(specId, "List$0", 0), "result"));
  }

  @Test
  void evaluateErrorsTest() throws Exception {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(60, 10);
    String specId = getField(controller.getInstance(Specs.SHORT_CODE, 0), "specId");
    // Node does not exist in this model
    assertTrue(getField(controller.eval(specId, "# Node", 0), "error").contains("Syntax error"));
  }

  @Test
  void checkListTabularTest() throws Exception {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(60, 10);
    assertTrue(
        getField(controller.getInstance(Specs.LIST_CODE, 0), "tabularInstance").contains("this/"));
  }

  @Test
  void checkTrafficTabularTest() throws Exception {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(60, 10);
    assertTrue(
        getField(controller.getInstance(Specs.TRAFFIC_CODE, 0), "tabularInstance")
            .contains("this/"));
  }

  @Test
  void translationErrorTest() {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(60, 10);
    String result = controller.getInstance(Specs.FARMER_CODE, 0);
    assertFalse(result.contains("is not bound to a legal value during translation"));
    // Nested module name (module examples/tutorial/farmer) + util/ordering must resolve.
    assertFalse(result.contains("error"), result);
  }

  @Test
  void rejectsInvalidPermalinkType() {
    AlloyInstanceControllerLocal controller = new AlloyInstanceControllerLocal(60, 10);
    assertTrue(controller.getInstance("SMT", "x", 0).contains("Invalid Permalink"));
  }

  /** Reads a field; single-element arrays (specId, tabularInstance, ...) are unwrapped. */
  private String getField(String json, String field) throws Exception {
    ObjectReader reader = new ObjectMapper().readerFor(Map.class);
    Map<String, Object> map = reader.readValue(json);
    Object value = map.get(field);
    if (value instanceof List) {
      return ((List<?>) value).get(0).toString();
    }
    return value.toString();
  }
}
