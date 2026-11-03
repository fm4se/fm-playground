package de.buw.fmp.alloy.api;

import de.buw.alloy.redundancy.AlloyRedundancyChecker;
import de.buw.alloy.redundancy.ModuleTransformer;
import de.buw.fmp.alloy.engine.AlloyEngine;
import de.buw.fmp.alloy.engine.json.JsonResponses;
import edu.mit.csail.sdg.alloy4.A4Reporter;
import edu.mit.csail.sdg.alloy4.Pos;
import edu.mit.csail.sdg.ast.Command;
import edu.mit.csail.sdg.ast.Expr;
import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.parser.CompUtil;
import edu.mit.csail.sdg.translator.A4Options;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller exposing the Alloy redundancy checking functionality as API
 * endpoints.
 *
 * <p>
 * All endpoints accept an Alloy model as source code in the request body and
 * return JSON
 * responses with redundancy analysis results.
 *
 * <p>
 * {@code maxRedundantSet} and {@code explain} delegate to the shared {@link AlloyEngine} (the
 * browser engine runs the same code). {@code check} and {@code explainNative} are server-only:
 * the latter needs a native SAT solver with UNSAT-core support.
 */
@RestController
public class RedundancyController {

  private final AlloyEngine engine;

  public RedundancyController(AlloyEngine engine) {
    this.engine = engine;
  }

  /**
   * Check for redundant constraints in an Alloy model.
   *
   * <p>
   * When cmdId is -1 (default), performs global redundancy checking across all
   * commands.
   * Otherwise checks redundancy for the specified command index.
   *
   * @param request the request containing the Alloy model code and optional cmdId
   * @return JSON with list of redundant constraints (position, text) or error
   */
  @CrossOrigin(origins = "*")
  @PostMapping("/alloy/redundancy/check")
  public String checkRedundancy(@RequestBody RedundancyRequest request) {
    if (request.getCode() == null || request.getCode().isBlank()) {
      return errorJson("No Alloy model code provided");
    }

    File tmpFile = null;
    try {
      tmpFile = writeToTempFile(request.getCode());
      A4Options opt = AlloyEngineConfiguration.SERVER_SOLVER.create();
      AlloyRedundancyChecker checker = new AlloyRedundancyChecker(opt);

      List<Expr> redundant = checker.redundantConstraints(tmpFile.getAbsolutePath(), request.getCmdId());

      // Build constraint list from parsed module for indexing
      CompModule m = CompUtil.parseEverything_fromFile(A4Reporter.NOP, null, tmpFile.getAbsolutePath());
      m = ModuleTransformer.globalizeInlineFacts(m);
      List<Expr> allConstraints = ModuleTransformer.flatten(m.getAllReachableFacts());

      JSONObject result = new JSONObject();
      result.put("status", HttpStatus.OK.value());
      result.put("redundantCount", redundant.size());
      result.put("totalConstraints", allConstraints.size());
      result.put("cmdId", request.getCmdId());

      JSONArray items = new JSONArray();
      for (Expr e : redundant) {
        JSONObject item = new JSONObject();
        item.put("position", posToJson(e.span()));
        item.put("expression", e.toString());
        // find index in all constraints
        for (int j = 0; j < allConstraints.size(); j++) {
          if (allConstraints.get(j).span().contains(e.pos)) {
            item.put("constraintIndex", j);
            break;
          }
        }
        // extract source text
        item.put("sourceText", extractSourceText(request.getCode(), e.span()));
        items.put(item);
      }
      result.put("redundantConstraints", items);
      return result.toString(2);

    } catch (Exception e) {
      return errorJson(e.getMessage());
    } finally {
      deleteTempFile(tmpFile);
    }
  }

  /**
   * Find the maximal redundant set of constraints in an Alloy model.
   *
   * <p>
   * When cmdId is -1 (default), computes the global maximal redundant set.
   * Otherwise computes it
   * for the specified command index.
   *
   * @param request the request containing the Alloy model code and optional cmdId
   * @return JSON with the maximal redundant set or error
   */
  @CrossOrigin(origins = "*")
  @PostMapping("/alloy/redundancy/maxRedundantSet")
  public String maxRedundantSet(@RequestBody RedundancyRequest request) {
    if (request.getCode() == null || request.getCode().isBlank()) {
      return errorJson("No Alloy model code provided");
    }
    return engine.maxRedundantSet(request.getCode(), request.getCmdId());
  }

  /**
   * Explain why a specific constraint is redundant (DDMin-based explanation).
   *
   * <p>
   * Provide either a cursorPos (1-based character offset into the source) or both
   * cmdId and
   * constraintId. When cursorPos is provided, the constraint at that position is
   * automatically
   * identified.
   *
   * @param request the request containing code and position info
   * @return JSON with the minimal entailing set that explains the redundancy, or
   *         null if not
   *         redundant
   */
  @CrossOrigin(origins = "*")
  @PostMapping("/alloy/redundancy/explain")
  public String explainRedundancy(@RequestBody RedundancyRequest request) {
    if (request.getCode() == null || request.getCode().isBlank()) {
      return errorJson("No Alloy model code provided");
    }
    if (request.getCursorPos() > 0) {
      return engine.explainRedundancyAtCursor(request.getCode(), request.getCursorPos());
    }
    return engine.explainRedundancy(
        request.getCode(), request.getCmdId(), request.getConstraintId());
  }

  /**
   * Explain redundancy using native UNSAT core extraction (faster but less
   * precise).
   *
   * <p>
   * Same interface as /explain but uses SAT solver core extraction instead of
   * DDMin.
   *
   * @param request the request containing code and position info
   * @return JSON with the core positions that explain the redundancy
   */
  @CrossOrigin(origins = "*")
  @PostMapping("/alloy/redundancy/explainNative")
  public String explainRedundancyNative(@RequestBody RedundancyRequest request) {
    if (request.getCode() == null || request.getCode().isBlank()) {
      return errorJson("No Alloy model code provided");
    }

    File tmpFile = null;
    try {
      tmpFile = writeToTempFile(request.getCode());
      A4Options opt = AlloyEngineConfiguration.SERVER_SOLVER.create();
      AlloyRedundancyChecker checker = new AlloyRedundancyChecker(opt);

      if (request.getCursorPos() > 0) {
        Pos p = Pos.toPos(request.getCode(), request.getCursorPos(), request.getCursorPos(), 4);
        List<Pos> entailingSet = checker.explainRedundancyNative(tmpFile.getAbsolutePath(), p);

        JSONObject result = new JSONObject();
        result.put("status", HttpStatus.OK.value());

        Expr selectedConstraint = checker.getSelectedConstraint();
        if (selectedConstraint != null) {
          JSONObject selected = new JSONObject();
          selected.put("position", posToJson(selectedConstraint.span()));
          selected.put("expression", selectedConstraint.toString());
          selected.put("sourceText", extractSourceText(request.getCode(), selectedConstraint.span()));
          result.put("selectedConstraint", selected);

          if (entailingSet == null) {
            result.put("redundant", false);
            result.put("message", "The selected constraint is not redundant.");
          } else if (entailingSet.isEmpty()) {
            result.put("redundant", true);
            result.put("message",
                "No explanation based on other facts found. Redundancy originates from structural elements.");
            result.put("entailingSet", new JSONArray());
          } else {
            result.put("redundant", true);
            result.put("entailingCount", entailingSet.size());
            JSONArray items = new JSONArray();
            for (Pos pos : entailingSet) {
              JSONObject item = new JSONObject();
              item.put("position", posToJson(pos));
              item.put("sourceText", extractSourceText(request.getCode(), pos));
              items.put(item);
            }
            result.put("entailingSet", items);
          }
        } else {
          result.put("message",
              "Unable to determine selected constraint. Is the cursor on a constraint?");
        }
        return result.toString(2);

      } else if (request.getCmdId() >= -1 && request.getConstraintId() >= 0) {
        CompModule m = CompUtil.parseEverything_fromFile(A4Reporter.NOP, null, tmpFile.getAbsolutePath());
        m = ModuleTransformer.globalizeInlineFacts(m);
        List<Expr> constraints = ModuleTransformer.flatten(m.getAllReachableFacts());

        if (request.getConstraintId() >= constraints.size()) {
          return errorJson(
              "Constraint ID " + request.getConstraintId() + " out of range. Total constraints: " + constraints.size());
        }

        Expr target = constraints.get(request.getConstraintId());
        Command cmd = request.getCmdId() == -1 ? null : m.getAllCommands().get(request.getCmdId());

        List<Pos> entailingSet = checker.explainRedundancyNative(m, cmd, constraints, target);

        JSONObject result = new JSONObject();
        result.put("status", HttpStatus.OK.value());

        JSONObject selected = new JSONObject();
        selected.put("position", posToJson(target.span()));
        selected.put("expression", target.toString());
        selected.put("constraintIndex", request.getConstraintId());
        selected.put("sourceText", extractSourceText(request.getCode(), target.span()));
        result.put("selectedConstraint", selected);

        if (entailingSet == null) {
          result.put("redundant", false);
          result.put("message", "The selected constraint is not redundant.");
        } else if (entailingSet.isEmpty()) {
          result.put("redundant", true);
          result.put("message",
              "No explanation based on other facts found. Redundancy originates from structural elements.");
          result.put("entailingSet", new JSONArray());
        } else {
          result.put("redundant", true);
          result.put("entailingCount", entailingSet.size());
          JSONArray items = new JSONArray();
          for (Pos pos : entailingSet) {
            JSONObject item = new JSONObject();
            item.put("position", posToJson(pos));
            item.put("sourceText", extractSourceText(request.getCode(), pos));
            items.put(item);
          }
          result.put("entailingSet", items);
        }
        return result.toString(2);

      } else {
        return errorJson("Provide either 'cursorPos' or both 'cmdId' and 'constraintId'");
      }

    } catch (Exception e) {
      return errorJson(e.getMessage());
    } finally {
      deleteTempFile(tmpFile);
    }
  }

  // ---- Helper methods ----

  /**
   * Write the given code to a temporary .als file.
   */
  private File writeToTempFile(String code) throws IOException {
    File tmpFile = File.createTempFile("alloy_redundancy_", ".als");
    tmpFile.deleteOnExit();
    try (BufferedOutputStream bos = new BufferedOutputStream(new FileOutputStream(tmpFile))) {
      bos.write(code.getBytes());
      bos.flush();
    }
    return tmpFile;
  }

  /**
   * Delete a temporary file if it exists.
   */
  private void deleteTempFile(File tmpFile) {
    if (tmpFile != null) {
      try {
        Files.deleteIfExists(tmpFile.toPath());
      } catch (IOException ignored) {
        // best effort cleanup
      }
    }
  }

  private static JSONObject posToJson(Pos p) {
    return JsonResponses.position(p);
  }

  private static String extractSourceText(String code, Pos p) {
    return JsonResponses.sourceText(code, p);
  }

  private static String errorJson(String message) {
    return JsonResponses.error(message).toString(2);
  }
}
