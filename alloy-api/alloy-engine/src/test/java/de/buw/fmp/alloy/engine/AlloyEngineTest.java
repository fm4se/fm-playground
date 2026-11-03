package de.buw.fmp.alloy.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import de.buw.fmp.alloy.engine.store.InMemorySolutionStore;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.Test;

class AlloyEngineTest {

  static final String LIST =
      // Not "next": that name clashes with util/integer's next (a genuine Alloy type error).
      "sig Node { link: lone Node }\n"
          + "fact { no n: Node | n in n.^link }\n"
          + "run { some link } for 3\n";

  static final String ORDERING =
      "open util/ordering[State]\n"
          + "sig State { val: Int }\n"
          + "fact { all s: State - last | s.next.val = s.val.plus[1] }\n"
          + "run {} for 3 but 3 State\n";

  static final String TEMPORAL =
      "var sig Light {}\n"
          + "fact { always eventually some Light }\n"
          + "run { eventually no Light } for 2 steps\n";

  static final String REDUNDANT =
      "sig A { r: set A }\n"
          + "fact f1 { all a: A | a not in a.r }\n"
          + "fact f2 { no iden & r }\n"
          + "run {} for 3\n";

  private final AlloyEngine engine =
      AlloyEngine.builder().solutionStore(new InMemorySolutionStore(10)).build();

  private static JSONObject json(String s) {
    return new JSONObject(s);
  }

  private static String specId(JSONObject instance) {
    return instance.getJSONArray("specId").getString(0);
  }

  @Test
  void findsInstanceInUiFormat() {
    JSONObject res = json(engine.findInstance(LIST, 0));
    assertFalse(res.has("error"), () -> res.toString());
    assertTrue(res.has("alloy"));
    // The UI reads these as single-element arrays.
    assertTrue(res.get("specId") instanceof JSONArray);
    assertTrue(res.get("tabularInstance") instanceof JSONArray);
    assertTrue(res.get("textInstance") instanceof JSONArray);
  }

  @Test
  void resolvesStandardLibrary() {
    JSONObject res = json(engine.findInstance(ORDERING, 0));
    assertFalse(res.has("error"), () -> res.toString());
  }

  @Test
  void solvesTemporalModels() {
    JSONObject res = json(engine.findInstance(TEMPORAL, 0));
    assertFalse(res.has("error"), () -> res.toString());
    assertTrue(res.getJSONArray("tabularInstance").getString(0).contains("------State 0"));
  }

  @Test
  void enumeratesAndEvaluates() {
    JSONObject first = json(engine.findInstance(LIST, 0));
    String id = specId(first);

    JSONObject next = json(engine.nextInstance(id));
    assertFalse(next.has("error"), () -> next.toString());
    assertEquals(id, specId(next));

    JSONObject eval = json(engine.evaluate(id, "#Node", 0));
    assertEquals(200, eval.getInt("status"), () -> eval.toString());
    assertTrue(eval.getString("result").matches("\\d+"));

    JSONObject atoms = json(engine.evaluate(id, "Node$0", 0));
    assertEquals(200, atoms.getInt("status"), () -> atoms.toString());
  }

  @Test
  void reportsSyntaxErrorsWithLocation() {
    JSONObject res = json(engine.findInstance("sig A { f: B", 0));
    String error = res.getString("error");
    assertEquals(400, res.getInt("status"));
    assertTrue(error.contains("Syntax error") && error.contains("line 1"), error);
    assertTrue(error.contains(".als"), "UI strips ' in <file>.als' from messages: " + error);
  }

  @Test
  void reportsUnsatisfiableCommands() {
    JSONObject res = json(engine.findInstance("sig A {} fact { some A and no A } run {}", 0));
    assertEquals("No instance found", res.getString("error"));
  }

  @Test
  void runsDefaultCommandWhenModelHasNone() {
    JSONObject res = json(engine.findInstance("sig A {}", 0));
    assertFalse(res.has("error"), () -> res.toString());
  }

  @Test
  void rejectsUnknownCommandsAndSpecs() {
    assertTrue(json(engine.findInstance(LIST, 5)).getString("error").contains("out of range"));
    assertTrue(json(engine.nextInstance("nope")).getString("error").contains("No instance found"));
    assertTrue(json(engine.evaluate("nope", "univ", 0)).has("error"));
  }

  @Test
  void findsMaxRedundantSet() {
    JSONObject res = json(engine.maxRedundantSet(REDUNDANT, -1));
    assertEquals(200, res.getInt("status"), () -> res.toString());
    assertEquals(1, res.getInt("redundantCount"), () -> res.toString());
    assertEquals(2, res.getInt("totalConstraints"));
  }

  @Test
  void explainsRedundancyAtCursor() {
    int cursor = REDUNDANT.indexOf("no iden") + 2;
    JSONObject res = json(engine.explainRedundancyAtCursor(REDUNDANT, cursor));
    assertEquals(200, res.getInt("status"), () -> res.toString());
    assertTrue(res.getBoolean("redundant"), () -> res.toString());
    assertTrue(res.getJSONObject("selectedConstraint").getString("sourceText").contains("iden"));
  }
}
