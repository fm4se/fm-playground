package de.buw.fmp.alloy.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.stream.Stream;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * The engine must answer exactly like the original server pipeline.
 *
 * <p>As a by-product the expected results are exported to {@code build/parity/fixtures.json};
 * {@code alloy-browser}'s {@code parityCheck} task replays them against the compiled
 * WebAssembly/JavaScript engines to prove the browser behaves like the JVM.
 */
class ServerParityTest {

  @TestFactory
  Stream<DynamicTest> firstInstanceMatchesLegacyServer() throws Exception {
    AlloyEngine engine = AlloyEngine.builder().build();
    return ParityModels.all().entrySet().stream()
        .map(
            m ->
                DynamicTest.dynamicTest(
                    m.getKey(),
                    () -> {
                      JSONObject expected = LegacyServerPipeline.findInstance(m.getValue(), 0);
                      JSONObject actual = new JSONObject(engine.findInstance(m.getValue(), 0));
                      assertEquals(
                          ParityModels.normalize(expected).toString(2),
                          ParityModels.normalize(actual).toString(2),
                          m.getKey());
                    }));
  }

  /** Models that additionally get redundancy fixtures (these analyses are comparatively slow). */
  private static final java.util.Set<String> REDUNDANCY_MODELS =
      java.util.Set.of(
          "redundant",
          "ordering",
          "models/book/appendixA/prison.als",
          "models/book/chapter2/addressBook1h.als",
          "models/book/chapter6/ringElection1.als");

  /** Expected first instance, second instance and an evaluation for every parity model. */
  @Test
  void exportBrowserParityFixtures() throws Exception {
    AlloyEngine engine = AlloyEngine.builder().build();
    JSONArray fixtures = new JSONArray();
    for (Map.Entry<String, String> m : ParityModels.all().entrySet()) {
      JSONObject first = new JSONObject(engine.findInstance(m.getValue(), 0));
      JSONObject fixture = new JSONObject();
      fixture.put("name", m.getKey());
      fixture.put("code", m.getValue());
      fixture.put("first", ParityModels.normalize(first));
      if (!first.has("error")) {
        String specId = first.getJSONArray("specId").getString(0);
        fixture.put("next", ParityModels.normalize(new JSONObject(engine.nextInstance(specId))));
        fixture.put(
            "eval", ParityModels.normalize(new JSONObject(engine.evaluate(specId, "univ", 0))));
      }
      if (REDUNDANCY_MODELS.contains(m.getKey())) {
        fixture.put(
            "maxRedundantSet",
            ParityModels.normalize(new JSONObject(engine.maxRedundantSet(m.getValue(), -1))));
        // 1-based offset a few characters into the body of the last fact.
        String code = m.getValue();
        int cursor = code.indexOf('{', Math.max(0, code.lastIndexOf("fact"))) + 4;
        fixture.put("explainCursor", cursor);
        fixture.put(
            "explain",
            ParityModels.normalize(
                new JSONObject(engine.explainRedundancyAtCursor(m.getValue(), cursor))));
      }
      fixtures.put(fixture);
    }
    Path out = Path.of("build", "parity", "fixtures.json");
    Files.createDirectories(out.getParent());
    Files.writeString(out, fixtures.toString(), StandardCharsets.UTF_8);
  }
}
