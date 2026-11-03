package de.buw.fmp.alloy.engine;

import de.buw.fmp.alloy.engine.instance.InstanceSerializerAccess;
import edu.mit.csail.sdg.alloy4.A4Reporter;
import edu.mit.csail.sdg.alloy4.XMLNode;
import edu.mit.csail.sdg.ast.Command;
import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.parser.CompUtil;
import edu.mit.csail.sdg.translator.A4Solution;
import edu.mit.csail.sdg.translator.A4SolutionReader;
import edu.mit.csail.sdg.translator.TranslateAlloyToKodkod;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Collections;
import org.json.JSONObject;
import org.json.XML;

/**
 * Reference implementation: the analysis pipeline exactly as the REST API implemented it before
 * the engine existed (temp files on disk, standard library from the JAR). Used to prove that the
 * engine produces the same results.
 */
final class LegacyServerPipeline {

  private LegacyServerPipeline() {}

  static JSONObject findInstance(String code, int cmd) throws Exception {
    File tmpAls = File.createTempFile("alloy_heredoc", ".als");
    try {
      Files.writeString(tmpAls.toPath(), code, StandardCharsets.UTF_8);
      CompModule module;
      try {
        module = CompUtil.parseEverything_fromFile(A4Reporter.NOP, null, tmpAls.getAbsolutePath());
      } catch (Exception e) {
        return new JSONObject().put("error", e.toString());
      }
      Command command =
          de.buw.fmp.alloy.engine.model.CommandResolver.resolve(module, cmd);
      A4Solution solution =
          TranslateAlloyToKodkod.execute_command(
              A4Reporter.NOP,
              module.getAllReachableSigs(),
              command,
              SolverOptionsFactory.SAT4J.create());
      if (!solution.satisfiable()) {
        return new JSONObject().put("error", "No instance found");
      }
      return toJson(solution);
    } finally {
      Files.deleteIfExists(tmpAls.toPath());
    }
  }

  static JSONObject toJson(A4Solution instance) throws Exception {
    File tmpXml = File.createTempFile("alloy_instance", ".xml");
    try {
      instance.writeXML(tmpXml.getAbsolutePath(), Collections.emptyList());
      JSONObject json = XML.toJSONObject(Files.readString(tmpXml.toPath()));
      A4Solution reread =
          A4SolutionReader.read(instance.getAllReachableSigs(), new XMLNode(tmpXml));
      json.append("specId", "legacy");
      json.append("tabularInstance", InstanceSerializerAccess.formatTabular(reread));
      json.append("textInstance", reread.toString());
      return json;
    } finally {
      Files.deleteIfExists(tmpXml.toPath());
    }
  }
}
