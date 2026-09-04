package de.buw.fmp.alloy.api;

import edu.mit.csail.sdg.alloy4.A4Reporter;
import edu.mit.csail.sdg.alloy4.XMLNode;
import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.parser.CompUtil;
import edu.mit.csail.sdg.translator.A4Options;
import edu.mit.csail.sdg.translator.A4Solution;
import edu.mit.csail.sdg.translator.A4SolutionReader;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeoutException;
import org.alloytools.alloy.diff.Analysis;
import org.alloytools.alloy.diff.ModuleDiff;
import org.json.JSONObject;
import org.json.XML;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

/**
 * REST controller exposing modular Alloy semantic difference capabilities.
 */
@RestController
public class DiffController {

  @Value("${API_URL:http://127.0.0.1:8000/}")
  private String apiUrl;

  private static int running = 0;

  /**
   * GET endpoint invoked by the frontend (alloyDiffExecutor.ts) using permalinks.
   */
  @CrossOrigin(origins = "*")
  @GetMapping("/alloy/diff/run/")
  public String runDiffFromPermalink(
      @RequestParam(required = true) String check,
      @RequestParam(required = true) String p,
      @RequestParam(required = false, defaultValue = "SemDiff") String analysis,
      @RequestParam(required = false, defaultValue = "-1") int cmdIndex1,
      @RequestParam(required = false, defaultValue = "-1") int cmdIndex2) {

    try {
      RestTemplate restTemplate = new RestTemplate();
      String currentUrl = apiUrl + "api/permalink/?check=" + check + "&p=" + p;
      String currentResponse = restTemplate.getForObject(currentUrl, String.class);
      if (currentResponse == null) {
        return errorJson("Failed to fetch current code from permalink.");
      }
      JSONObject currentObj = parseAsJsonObject(currentResponse);
      String rightCode = currentObj.optString("code", null);
      if (rightCode == null) {
        return errorJson("Invalid permalink payload for current code.");
      }

      String metadataUrl = apiUrl + "api/metadata?check=" + check + "&p=" + p;
      String metadataResponse = restTemplate.getForObject(metadataUrl, String.class);
      if (metadataResponse == null) {
        return errorJson("Failed to fetch metadata from permalink.");
      }
      JSONObject metaRes = parseAsJsonObject(metadataResponse);
      int leftSideCodeId = -1;
      if (metaRes.has("meta")) {
        Object metaObj = metaRes.get("meta");
        JSONObject meta;
        if (metaObj instanceof String) {
          meta = parseAsJsonObject((String) metaObj);
        } else if (metaObj instanceof JSONObject) {
          meta = (JSONObject) metaObj;
        } else {
          meta = new JSONObject();
        }
        leftSideCodeId = meta.optInt("leftSideCodeId", -1);
      }
      if (leftSideCodeId == -1) {
        return errorJson("Could not determine comparison (left-side) code ID from permalink metadata.");
      }

      String prevUrl = apiUrl + "api/code/" + leftSideCodeId;
      String prevResponse = restTemplate.getForObject(prevUrl, String.class);
      if (prevResponse == null) {
        return errorJson("Failed to fetch comparison code from ID: " + leftSideCodeId);
      }
      JSONObject prevObj = parseAsJsonObject(prevResponse);
      String leftCode = prevObj.optString("code", null);
      if (leftCode == null) {
        return errorJson("Invalid payload for comparison code.");
      }

      return executeDiff(leftCode, rightCode, analysis, -1, true, cmdIndex1, cmdIndex2);

    } catch (Exception e) {
      return errorJson("Error processing permalink diff: " + e.getMessage());
    }
  }

  /**
   * POST endpoint accepting direct model code strings via DiffRequest DTO.
   */
  @CrossOrigin(origins = "*")
  @PostMapping("/alloy/diff/run")
  public String runDiffFromRequest(@RequestBody DiffRequest request) {
    if (request == null || request.getLeftCode() == null || request.getRightCode() == null
        || request.getLeftCode().isBlank() || request.getRightCode().isBlank()) {
      return errorJson("Both left and right Alloy models must be provided and non-empty.");
    }
    String analysis = request.getAnalysis() != null ? request.getAnalysis() : "SemDiff";
    return executeDiff(request.getLeftCode(), request.getRightCode(), analysis, request.getScope(), request.isWithPred(), request.getCmdIndex1(), request.getCmdIndex2());
  }

  /**
   * GET endpoint for fetching the next witness by specId (used by frontend).
   */
  @CrossOrigin(origins = "*")
  @GetMapping("/alloy/diff/next/{specId}")
  public String getNextWitnessGet(
      @PathVariable String specId,
      @RequestParam(required = false) String p) {
    return getNextWitnessInternal(specId);
  }

  /**
   * POST endpoint for fetching the next witness by specId.
   */
  @CrossOrigin(origins = "*")
  @PostMapping("/alloy/diff/next")
  public String getNextWitnessPost(@RequestBody String specId) {
    // Strip quotes if passed as bare JSON string
    if (specId != null && specId.startsWith("\"") && specId.endsWith("\"")) {
      specId = specId.substring(1, specId.length() - 1);
    }
    return getNextWitnessInternal(specId);
  }

  private String executeDiff(String leftCode, String rightCode, String analysisStr, int scope, boolean withPred, int cmdIndex1, int cmdIndex2) {
    File leftFile = null;
    File rightFile = null;
    try {
      Analysis analysisEnum = Analysis.SemDiff;
      boolean swap = false;
      if ("common-witness".equals(analysisStr) || "CommonInst".equals(analysisStr)) {
        analysisEnum = Analysis.CommonInst;
      } else if ("not-current-but-previous".equals(analysisStr)) {
        analysisEnum = Analysis.SemDiff;
        swap = false;
      } else if ("not-previous-but-current".equals(analysisStr)) {
        analysisEnum = Analysis.SemDiff;
        swap = true;
      } else if ("semantic-relation".equals(analysisStr) || "Equivalence".equals(analysisStr)) {
        analysisEnum = Analysis.Equivalence;
      }

      leftFile = writeToTempFile(leftCode, "alloy_diff_left_");
      rightFile = writeToTempFile(rightCode, "alloy_diff_right_");

      CompModule rightModule = null;
      try {
        rightModule = CompUtil.parseEverything_fromFile(A4Reporter.NOP, null, rightFile.getAbsolutePath());
      } catch (Exception e) {
        // Ignored, we just won't have a module for eval if it fails to parse
      }
      final CompModule finalModule = rightModule;

      synchronized (ModuleDiff.class) {
        A4Options opt = AlloyInstanceController.getOptions();
        ModuleDiff.solver = opt.solver;
      }

      final Analysis finalAnalysis = analysisEnum;
      final int finalScope = scope;
      final boolean finalWithPred = withPred;
      final String leftPath = swap ? rightFile.getAbsolutePath() : leftFile.getAbsolutePath();
      final String rightPath = swap ? leftFile.getAbsolutePath() : rightFile.getAbsolutePath();
      final int finalCmdIndex1 = swap ? cmdIndex2 : cmdIndex1;
      final int finalCmdIndex2 = swap ? cmdIndex1 : cmdIndex2;

      A4Solution ans = runTimed(new DiffRunner() {
        @Override
        public A4Solution runDiff() {
          synchronized (ModuleDiff.class) {
            return ModuleDiff.diff(leftPath, rightPath, finalCmdIndex1, finalCmdIndex2, finalScope, finalWithPred, finalAnalysis);
          }
        }
      }, AlloyInstanceController.TIME_OUT);

      String specId;
      do {
        specId = Long.toHexString(Double.doubleToLongBits(Math.random()));
      } while (AlloyInstanceController.instances.containsKey(specId));

      AlloyInstanceController.instances.put(specId, new StoredSolution(finalModule, ans));

      return solutionToJson(specId, ans, finalAnalysis);

    } catch (Throwable t) {
      return errorJson(t.getMessage() != null ? t.getMessage() : "Unknown error during diff computation.");
    } finally {
      deleteTempFile(leftFile);
      deleteTempFile(rightFile);
    }
  }

  private String getNextWitnessInternal(String specId) {
    StoredSolution stored = AlloyInstanceController.instances.get(specId);
    if (stored == null) {
      return errorJson("No diff solution found, possibly cleaned up in the meantime.");
    }

    try {
      final A4Solution prevSolution = stored.getSolution();
      A4Solution nextSolution = runTimed(new DiffRunner() {
        @Override
        public A4Solution runDiff() {
          return prevSolution.next();
        }
      }, AlloyInstanceController.TIME_OUT);

      stored.setSolution(nextSolution);
      return solutionToJson(specId, nextSolution, null);

    } catch (Throwable t) {
      return errorJson(t.getMessage() != null ? t.getMessage() : "Error computing next witness.");
    }
  }

  private String solutionToJson(String specId, A4Solution ans, Analysis analysis) throws Exception {
    if (ans == null || !ans.satisfiable()) {
      String msg = "No more witnesses";
      if (analysis != null) {
        switch (analysis) {
          case SemDiff:
            msg = "No semantic differences found between the two models.";
            break;
          case CommonInst:
            msg = "No common instances found between the two models.";
            break;
          case Equivalence:
            msg = "No counterexample found: the two models are semantically equivalent.";
            break;
        }
      }
      return errorJson(msg);
    }

    File tmpFile = File.createTempFile("alloy_diff_instance", ".xml");
    tmpFile.deleteOnExit();
    ans.writeXML(tmpFile.getAbsolutePath(), Collections.emptyList());
    String instanceContent = Files.readString(Paths.get(tmpFile.getAbsolutePath()));
    JSONObject xmlJSONObj = XML.toJSONObject(instanceContent);

    ans =
        A4SolutionReader.read(
            ans.getAllReachableSigs(), new XMLNode(new File(tmpFile.getAbsolutePath())));

    xmlJSONObj.put("specId", specId);
    String tabularInstance = formatTabularInstance(ans);
    xmlJSONObj.put("tabularInstance", tabularInstance);
    String textInstance = ans.toString();
    xmlJSONObj.put("textInstance", textInstance);
    xmlJSONObj.put("satisfiable", true);
    xmlJSONObj.put("witness", tabularInstance);

    return xmlJSONObj.toString(4);
  }

  private String formatTabularInstance(A4Solution instance) {
    if (instance.getTraceLength() <= 1) {
      return instance.format();
    }
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < instance.getTraceLength(); i++) {
      sb.append("------State ").append(i).append("-------\n");
      sb.append(instance.format(i));
      sb.append("\n");
    }
    return sb.toString();
  }

  public A4Solution runTimed(DiffRunner r, int seconds) throws Throwable {
    if (running >= AlloyInstanceController.MAX_RUNNING) {
      throw new RuntimeException("Too many instances running. Please try again later.");
    }
    Thread t = new Thread(r);
    t.start();

    running++;
    t.join(seconds * 1000L);
    running--;

    if (t.isAlive()) {
      t.interrupt();
      throw new TimeoutException("Analysis timed out after " + seconds + " seconds.");
    }
    if (r.instance == null) {
      if (r.reasonForFailing != null) {
        throw r.reasonForFailing;
      }
      throw new RuntimeException("Diff evaluation produced no result.");
    }
    return r.instance;
  }

  private File writeToTempFile(String code, String prefix) throws IOException {
    File tmpFile = File.createTempFile(prefix, ".als");
    tmpFile.deleteOnExit();
    try (BufferedOutputStream bos = new BufferedOutputStream(new FileOutputStream(tmpFile))) {
      bos.write(code.getBytes());
      bos.flush();
    }
    return tmpFile;
  }

  private void deleteTempFile(File tmpFile) {
    if (tmpFile != null) {
      try {
        Files.deleteIfExists(tmpFile.toPath());
      } catch (IOException ignored) {
      }
    }
  }

  private String errorJson(String message) {
    JSONObject obj = new JSONObject();
    obj.put("error", message);
    obj.put("status", HttpStatus.BAD_REQUEST.value());
    return obj.toString(2);
  }

  private JSONObject parseAsJsonObject(String response) {
    if (response == null || response.trim().isEmpty()) {
      return new JSONObject();
    }
    String text = response.trim();
    while (text.startsWith("\"") && text.endsWith("\"") && text.length() >= 2) {
      try {
        Object val = new org.json.JSONTokener(text).nextValue();
        if (val instanceof String) {
          text = ((String) val).trim();
        } else {
          break;
        }
      } catch (Exception e) {
        break;
      }
    }
    return new JSONObject(text);
  }

  private abstract static class DiffRunner implements Runnable {
    protected A4Solution instance;
    protected Throwable reasonForFailing;

    public abstract A4Solution runDiff();

    @Override
    public void run() {
      try {
        instance = runDiff();
      } catch (Throwable t) {
        reasonForFailing = t;
      }
    }
  }
}
