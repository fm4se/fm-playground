package de.buw.fmp.alloy.api;

import edu.mit.csail.sdg.alloy4.A4Reporter;
import edu.mit.csail.sdg.alloy4.Pos;
import edu.mit.csail.sdg.alloy4.XMLNode;
import edu.mit.csail.sdg.ast.Command;
import edu.mit.csail.sdg.ast.Expr;
import edu.mit.csail.sdg.ast.ExprConstant;
import edu.mit.csail.sdg.ast.ExprVar;
import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.parser.CompUtil;
import edu.mit.csail.sdg.translator.A4Options;
import edu.mit.csail.sdg.translator.A4Solution;
import edu.mit.csail.sdg.translator.A4SolutionReader;
import edu.mit.csail.sdg.translator.TranslateAlloyToKodkod;
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
import kodkod.engine.satlab.SATFactory;
import org.json.JSONObject;
import org.json.XML;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;

@RestController
public class AlloyInstanceController {
  @Value("${API_URL:http://127.0.0.1:8000/}")
  private String apiUrl;

  public static int TIME_OUT = 60;
  public static int MAX_RUNNING = 10;

  protected static int running = 0;

  static Map<String, StoredSolution> instances = new LinkedHashMap<>();

  public static A4Options getOptions() {
    A4Options opt = new A4Options();
    // Use MiniSat solver with SAT4J as fallback if MiniSat is not available
    opt.solver = SATFactory.find("minisat").orElse(SATFactory.DEFAULT);
    // System.out.println("Using SAT solver: " + opt.solver.id() + " (available: " +
    // opt.solver.isPresent() + ")");
    return opt;
  }

  @CrossOrigin(origins = "*")
  @GetMapping("/alloy/instance")
  public String getInstance(
      @RequestParam(required = true) String check,
      @RequestParam(required = true) String p,
      @RequestParam(required = true) int cmd)
      throws IOException {

    if (!"ALS".equalsIgnoreCase(check)) {
      JSONObject obj = new JSONObject();
      obj.put("error", "Invalid Permalink");
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }

    String code = getCodeByPermalink(check, p);
    if (code == null) {
      JSONObject obj = new JSONObject();
      obj.put("error", "Invalid Permalink");
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }

    CompModule module = null;
    // parse Alloy file from code variable
    try {
      File tmpAls = File.createTempFile("alloy_heredoc", ".als");
      tmpAls.deleteOnExit();
      BufferedOutputStream bos = new BufferedOutputStream(new FileOutputStream(tmpAls));
      bos.write(code.getBytes());
      bos.flush();
      bos.close();

      // Parse with null map to allow standard library module resolution
      module = CompUtil.parseEverything_fromFile(A4Reporter.NOP, null, tmpAls.getAbsolutePath());
      tmpAls.deleteOnExit();
    } catch (Exception e) {
      // return error message as JSON with http status code 400
      JSONObject obj = new JSONObject();
      obj.put("error", e.toString());
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }

    final CompModule finalModule = module; // final for use in lambda
    Command runCommand = module.getAllCommands().get(cmd);
    if (cmd == 0 && hasDefaultCommand(module)) {
      // Create a "run" command keyword for the default command
      ExprVar runKeyword = ExprVar.make(Pos.UNKNOWN, "run");
      runCommand =
          new Command(
              Pos.UNKNOWN,
              ExprConstant.TRUE,
              "FMPlayDefault",
              false,
              4,
              4,
              4,
              -1,
              -1,
              -1,
              null,
              null,
              runKeyword,
              runCommand.formula,
              null);
    }

    A4Options options = getOptions();
    // get the first instance of the Alloy file
    A4Solution instance;
    // SafeList<Sig> sigs = module.getAllSigs();
    try {
      Command finalRunCommand = runCommand;
      instance =
          runTimed(
              new InstanceRunner() {
                @Override
                public A4Solution runInstance() {
                  return TranslateAlloyToKodkod.execute_command(
                      A4Reporter.NOP, finalModule.getAllReachableSigs(), finalRunCommand, options);
                }
              },
              TIME_OUT);
    } catch (Throwable t) {
      // return error message as JSON with http status code 400
      JSONObject obj = new JSONObject();
      String message = t.getMessage();
      obj.put("error", message);
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }

    String specId = null;
    // generate a unieuq id for the instance
    do {
      specId = Long.toHexString(Double.doubleToLongBits(Math.random()));
    } while (instances.containsKey(specId));
    // store the instance in the instances map
    instances.put(specId, new StoredSolution(module, instance));

    return instanceToJson(specId, instance);
  }

  /**
   * Format the instance in tabular form
   *
   * <p>In case of temporal instance, it will format the instance for each state
   *
   * @param instance
   * @return
   */
  private String formatTabularInstance(A4Solution instance) {
    // check if instance is temporal
    if (instance.getTraceLength() == 1) {
      return instance.format();
    }
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < instance.getTraceLength(); i++) {
      sb.append("------State " + i + "-------\n");
      sb.append(instance.format(i));
      sb.append("\n");
    }
    return sb.toString();
  }

  public String getCodeByPermalink(String check, String p) {
    try {
      RestTemplate restTemplate = new RestTemplate();
      String url = apiUrl + "api/permalink/?check=" + check + "&p=" + p;
      String response = restTemplate.getForObject(url, String.class);
      JSONObject obj = new JSONObject(response);
      return obj.getString("code");

    } catch (Exception e) {
      return null;
    }
  }

  private boolean hasDefaultCommand(CompModule module) {
    if (module.getAllCommands().size() == 1) {
      Command cmd = module.getAllCommands().get(0);
      if (Pos.UNKNOWN.equals(cmd.pos)) {
        return true;
      }
    }
    return false;
  }

  @CrossOrigin(origins = "*")
  @PostMapping("/alloy/nextInstance")
  public String getNextInstance(@RequestBody String specId) throws IOException {
    StoredSolution storedSolution = instances.get(specId);
    if (storedSolution == null) {
      JSONObject obj = new JSONObject();
      obj.put("error", "No instance found, possibly cleaned up in the meantime");
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }

    A4Solution instance = storedSolution.getSolution();

    try {
      final A4Solution finalInstance = instance;
      instance =
          runTimed(
              new InstanceRunner() {
                @Override
                public A4Solution runInstance() {
                  return finalInstance.next();
                }
              },
              TIME_OUT);
    } catch (Throwable t) {
      JSONObject obj = new JSONObject();
      String message = t.getMessage();
      obj.put("error", message);
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }

    storedSolution.setSolution(instance);

    return instanceToJson(specId, instance);
  }

  /**
   * Convert the instance to a JSON response that contains a JSON encoding, the specId, the tabular
   * instance and the instance as text
   *
   * @param specId
   * @param instance
   * @return
   * @throws IOException
   */
  private String instanceToJson(String specId, A4Solution instance) throws IOException {

    if (!instance.satisfiable()) {
      JSONObject obj = new JSONObject();
      obj.put("error", "No instance found");
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }

    File tmpFile = File.createTempFile("alloy_instance", ".xml");
    tmpFile.deleteOnExit();
    // Pass empty list to work around Alloy 6.2.0 bug where null extraSkolems causes
    // NPE
    instance.writeXML(tmpFile.getAbsolutePath(), Collections.emptyList());
    // read content of instance.xml as String
    String instanceContent = Files.readString(Paths.get(tmpFile.getAbsolutePath()));
    JSONObject xmlJSONObj = XML.toJSONObject(instanceContent);

    // replace instance by a the serialized and then deserialized instance (there is
    // a bug in the
    // tabular instance printing otherwise)
    instance =
        A4SolutionReader.read(
            instance.getAllReachableSigs(), new XMLNode(new File(tmpFile.getAbsolutePath())));

    xmlJSONObj.append("specId", specId);
    String tabularInstance = formatTabularInstance(instance);
    xmlJSONObj.append("tabularInstance", tabularInstance);
    String textInstance = instance.toString();
    xmlJSONObj.append("textInstance", textInstance);
    String jsonPrettyPrintString = xmlJSONObj.toString(4);

    return jsonPrettyPrintString;
  }

  /**
   * Evaluates an Alloy expression on a given specification instance.
   *
   * @param specId The ID of the specification instance to evaluate.
   * @param expr The Alloy expression to evaluate.
   * @param state The state of the solution to evaluate the expression on (default is 0).
   * @return A JSON string containing the result of the evaluation or an error message.
   * @throws IOException If an input or output exception occurs.
   */
  @CrossOrigin(origins = "*")
  @GetMapping("/alloy/eval")
  public String eval(
      @RequestParam String specId,
      @RequestParam String expr,
      @RequestParam(required = false, defaultValue = "0") int state)
      throws IOException {
    StoredSolution storedSolution = instances.get(specId);
    if (storedSolution == null) {
      JSONObject obj = new JSONObject();
      obj.put("error", "No instance found, possibly cleaned up in the meantime");
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }

    String result = "";
    try {
      Expr e = parseExpression(expr, storedSolution);
      // evaluate expression
      result = storedSolution.getSolution().eval(e, state).toString();
    } catch (Exception e) {
      JSONObject obj = new JSONObject();
      obj.put("error", e.toString());
      obj.put("status", HttpStatus.BAD_REQUEST.value());
      return obj.toString();
    }
    JSONObject obj = new JSONObject();
    obj.put("result", result);
    obj.put("status", HttpStatus.OK.value());
    return obj.toString();
  }

  /**
   * Parses an Alloy expression from a string.
   *
   * <p>This method uses reflection to temporarily extend the globals of the module with the atoms
   * from the stored solution.
   *
   * @param expr
   * @param storedSolution
   * @return
   * @throws NoSuchFieldException
   * @throws IllegalAccessException
   */
  private Expr parseExpression(String expr, StoredSolution storedSolution)
      throws NoSuchFieldException, IllegalAccessException {
    A4Solution instance = storedSolution.getSolution();
    CompModule root = storedSolution.getModule();
    // get globals from module
    java.lang.reflect.Field globalsField = CompModule.class.getDeclaredField("globals");
    globalsField.setAccessible(true);
    Map<String, Expr> oldGlobals = new LinkedHashMap<>((Map<String, Expr>) globalsField.get(root));
    // extend globals
    for (ExprVar a : instance.getAllAtoms()) {
      root.addGlobal(a.label, a);
    }
    for (ExprVar a : instance.getAllSkolems()) {
      root.addGlobal(a.label, a);
    }
    Expr e = CompUtil.parseOneExpression_fromString(root, expr);
    // restore globals
    globalsField.set(root, oldGlobals);
    return e;
  }

  @Scheduled(fixedRate = 30000)
  public void removeOlsInstances() {
    long currentTime = System.currentTimeMillis();
    instances
        .entrySet()
        .removeIf(entry -> currentTime - entry.getValue().getLastAccessed() > 3600000);
  }

  public A4Solution runTimed(InstanceRunner r, int seconds) throws Throwable {

    if (running >= MAX_RUNNING) {
      throw new RuntimeException("Too many instances running. Please try again later.");
    }
    Thread t = new Thread(r);
    t.start();

    // wait for the thread to finish or timeout
    running++;
    t.join(seconds * 1000);
    running--;

    if (t.isAlive()) {
      t.interrupt();
      throw new TimeoutException("Analysis timed out after " + seconds + " seconds.");
    }
    if (r.instance == null) {
      throw r.reasonForFailing;
    }
    return r.instance;
  }

  private abstract class InstanceRunner implements Runnable {
    private A4Solution instance;
    private Throwable reasonForFailing;

    public abstract A4Solution runInstance();

    @Override
    public void run() {
      try {
        instance = runInstance();
      } catch (Throwable t) {
        reasonForFailing = t;
      }
    }
  }
}
