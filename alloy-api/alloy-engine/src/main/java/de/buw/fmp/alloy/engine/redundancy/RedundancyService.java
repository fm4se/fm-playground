package de.buw.fmp.alloy.engine.redundancy;

import static de.buw.fmp.alloy.engine.json.JsonResponses.error;
import static de.buw.fmp.alloy.engine.json.JsonResponses.messageOf;
import static de.buw.fmp.alloy.engine.json.JsonResponses.position;
import static de.buw.fmp.alloy.engine.json.JsonResponses.sourceText;

import de.buw.alloy.redundancy.AlloyRedundancyChecker;
import de.buw.alloy.redundancy.ModuleTransformer;
import de.buw.fmp.alloy.engine.AnalysisRunner;
import de.buw.fmp.alloy.engine.SolverOptionsFactory;
import de.buw.fmp.alloy.engine.json.JsonResponses;
import de.buw.fmp.alloy.engine.model.AlloyModelParser;
import edu.mit.csail.sdg.alloy4.Pos;
import edu.mit.csail.sdg.ast.Command;
import edu.mit.csail.sdg.ast.Expr;
import edu.mit.csail.sdg.parser.CompModule;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Redundancy analyses (maximal redundant set, DDMin-based explanation) on in-memory models.
 *
 * <p>The file-path based entry points of {@link AlloyRedundancyChecker} would require a real file
 * system, so this class parses models itself and calls the checker's module-based API.
 */
public final class RedundancyService {

  private final SolverOptionsFactory solverOptions;
  private final AnalysisRunner runner;

  public RedundancyService(SolverOptionsFactory solverOptions, AnalysisRunner runner) {
    this.solverOptions = Objects.requireNonNull(solverOptions);
    this.runner = Objects.requireNonNull(runner);
  }

  /**
   * Maximal set of redundant constraints, globally ({@code cmdId == -1}) or for one command.
   */
  public JSONObject maxRedundantSet(String code, int cmdId) {
    try {
      return runner.run(() -> computeMaxRedundantSet(code, cmdId));
    } catch (Throwable t) {
      return error(messageOf(t));
    }
  }

  /** Explains why the constraint at the 1-based character offset {@code cursorPos} is redundant. */
  public JSONObject explainAtCursor(String code, int cursorPos) {
    try {
      return runner.run(() -> computeExplainAtCursor(code, cursorPos));
    } catch (Throwable t) {
      return error(messageOf(t));
    }
  }

  /** Explains why constraint {@code constraintId} is redundant for {@code cmdId} (-1: global). */
  public JSONObject explainConstraint(String code, int cmdId, int constraintId) {
    try {
      return runner.run(() -> computeExplainConstraint(code, cmdId, constraintId));
    } catch (Throwable t) {
      return error(messageOf(t));
    }
  }

  // ---------------------------------------------------------------------------------------------

  private JSONObject computeMaxRedundantSet(String code, int cmdId) throws Exception {
    List<Expr> allConstraints = globalConstraints(AlloyModelParser.parse(code));

    // The checker gets a fresh, untransformed module (as with its file-based API).
    CompModule module = AlloyModelParser.parse(code);
    AlloyRedundancyChecker checker = new AlloyRedundancyChecker(solverOptions.create());
    List<Expr> maxSet =
        cmdId == -1
            ? checker.maxRedundantSet(module)
            : checker.maxRedundantSet(module, module.getAllCommands().get(cmdId));

    JSONObject result = new JSONObject();
    result.put("status", JsonResponses.OK);
    result.put("redundantCount", maxSet.size());
    result.put("totalConstraints", allConstraints.size());
    result.put("cmdId", cmdId);

    JSONArray items = new JSONArray();
    for (Expr e : maxSet) {
      JSONObject item = describe(code, e);
      for (int j = 0; j < allConstraints.size(); j++) {
        if (allConstraints.get(j).span().contains(e.pos)) {
          item.put("constraintIndex", j);
          break;
        }
      }
      items.put(item);
    }
    result.put("redundantConstraints", items);
    return result;
  }

  private JSONObject computeExplainAtCursor(String code, int cursorPos) throws Exception {
    if (cursorPos <= 0) {
      return error("Provide either 'cursorPos' or both 'cmdId' and 'constraintId'");
    }
    Pos cursor = Pos.toPos(code, cursorPos, cursorPos, 4);
    CompModule module = ModuleTransformer.globalizeInlineFacts(AlloyModelParser.parse(code));
    List<Expr> facts = ModuleTransformer.flatten(module.getAllReachableFacts());
    AlloyRedundancyChecker checker = new AlloyRedundancyChecker(solverOptions.create());

    // 1) A fact under the cursor: explain it against all facts, for the first command.
    for (Expr fact : facts) {
      if (covers(fact, cursor)) {
        return explanation(code, fact, -1, checker.explainRedundancy(module, null, facts, fact));
      }
    }

    // 2) A conjunct of a command's own formula under the cursor.
    for (Command command : module.getAllCommands()) {
      List<Expr> commandExprs = ModuleTransformer.flatten(command.formula);
      List<Expr> ownExprs = new ArrayList<>(commandExprs);
      ownExprs.removeAll(facts);
      for (Expr expr : ownExprs) {
        if (covers(expr, cursor)) {
          return explanation(
              code, expr, -1, checker.explainRedundancy(module, command, commandExprs, expr));
        }
      }
    }

    JSONObject result = new JSONObject();
    result.put("status", JsonResponses.OK);
    result.put("message", "Unable to determine selected constraint. Is the cursor on a constraint?");
    return result;
  }

  private JSONObject computeExplainConstraint(String code, int cmdId, int constraintId)
      throws Exception {
    if (cmdId < -1 || constraintId < 0) {
      return error("Provide either 'cursorPos' or both 'cmdId' and 'constraintId'");
    }
    CompModule module = ModuleTransformer.globalizeInlineFacts(AlloyModelParser.parse(code));
    List<Expr> constraints = ModuleTransformer.flatten(module.getAllReachableFacts());
    if (constraintId >= constraints.size()) {
      return error(
          "Constraint ID " + constraintId + " out of range. Total constraints: "
              + constraints.size());
    }
    Expr target = constraints.get(constraintId);
    Command command = cmdId == -1 ? null : module.getAllCommands().get(cmdId);
    AlloyRedundancyChecker checker = new AlloyRedundancyChecker(solverOptions.create());
    return explanation(
        code,
        target,
        constraintId,
        checker.explainRedundancy(module, command, constraints, target));
  }

  // ---------------------------------------------------------------------------------------------

  private static List<Expr> globalConstraints(CompModule parsed) {
    CompModule module = ModuleTransformer.globalizeInlineFacts(parsed);
    return ModuleTransformer.flatten(module.getAllReachableFacts());
  }

  private static boolean covers(Expr e, Pos cursor) {
    return e.pos.contains(cursor) || e.span().contains(cursor);
  }

  private static JSONObject describe(String code, Expr e) {
    JSONObject item = new JSONObject();
    item.put("position", position(e.span()));
    item.put("expression", e.toString());
    item.put("sourceText", sourceText(code, e.span()));
    return item;
  }

  /**
   * Builds the explanation response.
   *
   * @param entailingSet {@code null}: not redundant; empty: redundant because of structure only
   */
  private static JSONObject explanation(
      String code, Expr selected, int constraintIndex, List<Expr> entailingSet) {
    JSONObject result = new JSONObject();
    result.put("status", JsonResponses.OK);

    JSONObject selectedJson = new JSONObject();
    selectedJson.put("position", position(selected.span()));
    selectedJson.put("expression", selected.toString());
    if (constraintIndex >= 0) {
      selectedJson.put("constraintIndex", constraintIndex);
    }
    selectedJson.put("sourceText", sourceText(code, selected.span()));
    result.put("selectedConstraint", selectedJson);

    if (entailingSet == null) {
      result.put("redundant", false);
      result.put("message", "The selected constraint is not redundant.");
    } else if (entailingSet.isEmpty()) {
      result.put("redundant", true);
      result.put(
          "message",
          "No explanation based on other facts found. "
              + "Redundancy originates from structural elements.");
      result.put("entailingSet", new JSONArray());
    } else {
      result.put("redundant", true);
      result.put("entailingCount", entailingSet.size());
      JSONArray items = new JSONArray();
      for (Expr e : entailingSet) {
        items.put(describe(code, e));
      }
      result.put("entailingSet", items);
    }
    return result;
  }
}
