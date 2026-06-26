package de.buw.fmp.alloy.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class RedundancyControllerTest {

  private RedundancyController controller;

  @BeforeEach
  void setUp() {
    controller = new RedundancyController();
  }

  @Test
  void testRedundancyRequestDto() {
    RedundancyRequest req = new RedundancyRequest();
    req.setCode("sig A {}");
    req.setCmdId(0);
    req.setConstraintId(2);
    req.setCursorPos(15);

    assertEquals("sig A {}", req.getCode());
    assertEquals(0, req.getCmdId());
    assertEquals(2, req.getConstraintId());
    assertEquals(15, req.getCursorPos());
  }

  @Test
  void testCheckRedundancyTask1() {
    String code = loadExperimentModel("task1.als");
    RedundancyRequest req = new RedundancyRequest();
    req.setCode(code);
    req.setCmdId(-1);

    String response = controller.checkRedundancy(req);
    JSONObject json = new JSONObject(response);

    assertEquals(200, json.getInt("status"));
    assertEquals(-1, json.getInt("cmdId"));
    assertEquals(2, json.getInt("totalConstraints"));
    assertTrue(json.getInt("redundantCount") >= 1);
    JSONArray items = json.getJSONArray("redundantConstraints");
    assertNotNull(items);
    assertTrue(items.length() >= 1);
  }

  @Test
  void testMaxRedundantSetTask1() {
    String code = loadExperimentModel("task1.als");
    RedundancyRequest req = new RedundancyRequest();
    req.setCode(code);
    req.setCmdId(-1);

    String response = controller.maxRedundantSet(req);
    JSONObject json = new JSONObject(response);

    assertEquals(200, json.getInt("status"));
    assertEquals(2, json.getInt("totalConstraints"));
    assertTrue(json.getInt("redundantCount") >= 1);
    assertNotNull(json.getJSONArray("redundantConstraints"));
  }

  @Test
  void testExplainRedundancyByIndex() {
    String code = loadExperimentModel("task1.als");
    RedundancyRequest req = new RedundancyRequest();
    req.setCode(code);
    req.setCmdId(-1);
    req.setConstraintId(1); // moduleTeacherTeachesModule

    String response = controller.explainRedundancy(req);
    JSONObject json = new JSONObject(response);

    assertEquals(200, json.getInt("status"));
    assertTrue(json.has("selectedConstraint"));
    assertEquals(1, json.getJSONObject("selectedConstraint").getInt("constraintIndex"));
    assertTrue(json.getBoolean("redundant"));
    assertTrue(json.has("entailingSet"));
  }

  @Test
  void testExplainRedundancyByCursor() {
    String code = loadExperimentModel("task1.als");
    RedundancyRequest req = new RedundancyRequest();
    req.setCode(code);
    // Cursor position inside the actual second fact expression
    int offset = code.indexOf("all m : Module");
    assertTrue(offset >= 0, "Expected the second fact expression to be present in the model");
    req.setCursorPos(offset + 6);

    String response = controller.explainRedundancy(req);
    JSONObject json = new JSONObject(response);

    assertEquals(200, json.getInt("status"));
    assertTrue(json.has("selectedConstraint"));
  }

  @Test
  void testErrorHandlingEmptyCode() {
    RedundancyRequest req = new RedundancyRequest();
    req.setCode("");

    assertEquals(400, new JSONObject(controller.checkRedundancy(req)).getInt("status"));
    assertEquals(400, new JSONObject(controller.maxRedundantSet(req)).getInt("status"));
    assertEquals(400, new JSONObject(controller.explainRedundancy(req)).getInt("status"));
    assertEquals(400, new JSONObject(controller.explainRedundancyNative(req)).getInt("status"));
  }

  @Test
  void testErrorHandlingInvalidSyntax() {
    RedundancyRequest req = new RedundancyRequest();
    req.setCode("sig A { invalid syntax {{{ ");

    String response = controller.checkRedundancy(req);
    JSONObject json = new JSONObject(response);

    assertEquals(400, json.getInt("status"));
    assertTrue(json.has("error"));
  }

  /**
   * Helper method to load example models from experiment resources.
   */
  private String loadExperimentModel(String filename) {
    Path path1 = Paths.get("..", "org.alloytools.alloy.application", "src", "test", "resources",
        "experiment", filename);
    Path path2 = Paths.get("org.alloytools.alloy.application", "src", "test", "resources",
        "experiment", filename);
    if (Files.exists(path1)) {
      try {
        return Files.readString(path1);
      } catch (IOException ignored) {
      }
    }
    if (Files.exists(path2)) {
      try {
        return Files.readString(path2);
      } catch (IOException ignored) {
      }
    }
    // Fallback embedded models
    if ("task1.als".equals(filename)) {
      return """
          abstract sig Person {
            teaches : set Module
          }

          sig Professor extends Person {}

          sig Module {
            teacher : Person
          }

          fact teachersOfModules {
            // teachers teach their modules
            teacher = ~teaches
          }

          fact moduleTeacherTeachesModule {
            all m : Module | m in m.teacher.teaches
          }

          run {some teaches} for 2
          """;
    }
    return "";
  }
}
