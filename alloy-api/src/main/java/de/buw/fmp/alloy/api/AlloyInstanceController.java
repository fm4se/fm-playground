package de.buw.fmp.alloy.api;

import de.buw.fmp.alloy.engine.AlloyEngine;
import de.buw.fmp.alloy.engine.json.JsonResponses;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

/**
 * REST adapter for finding instances, enumerating further instances and evaluating expressions.
 *
 * <p>All analysis logic is in {@link AlloyEngine} (module {@code alloy-engine}), which the
 * frontend can also run in the browser. Responses are identical in both cases.
 */
@RestController
public class AlloyInstanceController {

  /** Solutions not touched for this long are dropped. */
  static final long MAX_IDLE_MILLIS = 3_600_000;

  private final AlloyEngine engine;

  @Value("${API_URL:http://127.0.0.1:8000/}")
  private String apiUrl;

  public AlloyInstanceController(AlloyEngine engine) {
    this.engine = engine;
  }

  @CrossOrigin(origins = "*")
  @GetMapping("/alloy/instance")
  public String getInstance(
      @RequestParam(required = true) String check,
      @RequestParam(required = true) String p,
      @RequestParam(required = true) int cmd) {
    if (!"ALS".equalsIgnoreCase(check)) {
      return JsonResponses.error("Invalid Permalink").toString();
    }
    String code = getCodeByPermalink(check, p);
    if (code == null) {
      return JsonResponses.error("Invalid Permalink").toString();
    }
    return engine.findInstance(code, cmd);
  }

  @CrossOrigin(origins = "*")
  @PostMapping("/alloy/nextInstance")
  public String getNextInstance(@RequestBody String specId) {
    return engine.nextInstance(specId);
  }

  /**
   * Evaluates an Alloy expression on the current instance of {@code specId}.
   *
   * @param state the state of a temporal instance (default 0)
   */
  @CrossOrigin(origins = "*")
  @GetMapping("/alloy/eval")
  public String eval(
      @RequestParam String specId,
      @RequestParam String expr,
      @RequestParam(required = false, defaultValue = "0") int state) {
    return engine.evaluate(specId, expr, state);
  }

  /** Resolves a permalink to the stored model source via the playground backend. */
  public String getCodeByPermalink(String check, String p) {
    try {
      RestTemplate restTemplate = new RestTemplate();
      String url = apiUrl + "api/permalink/?check=" + check + "&p=" + p;
      String response = restTemplate.getForObject(url, String.class);
      return new JSONObject(response).getString("code");
    } catch (Exception e) {
      return null;
    }
  }

  @Scheduled(fixedRate = 30000)
  public void removeIdleSolutions() {
    engine.solutionStore().evictIdle(MAX_IDLE_MILLIS);
  }
}
