package de.buw.fmp.alloy.engine;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.json.JSONArray;
import org.json.JSONObject;

/** Models used to check that all execution paths (legacy server, engine, browser) agree. */
final class ParityModels {

  /** Takes ~90 s per run with SAT4J; parity is identical but too slow for every build. */
  private static final Set<String> TOO_SLOW_FOR_UNIT_TESTS =
      Set.of("models/book/chapter6/hotel4.als");

  private ParityModels() {}

  /** Name to source: the inline models of {@link AlloyEngineTest} plus Alloy's book examples. */
  static Map<String, String> all() throws Exception {
    Map<String, String> models = new LinkedHashMap<>();
    models.put("list", AlloyEngineTest.LIST);
    models.put("ordering", AlloyEngineTest.ORDERING);
    models.put("temporal", AlloyEngineTest.TEMPORAL);
    models.put("redundant", AlloyEngineTest.REDUNDANT);
    models.put("default-command", "sig A { f: set A }");
    models.put("syntax-error", "sig A { f: B");
    models.put("unsat", "sig A {} fact { some A and no A } run {}");
    models.putAll(bookModels());
    return models;
  }

  /** Book examples that do not import other book modules (those need sibling files). */
  private static Map<String, String> bookModels() throws Exception {
    Map<String, String> result = new LinkedHashMap<>();
    try (ZipFile zip = new ZipFile(new File(System.getProperty("alloy.distJar")))) {
      Iterator<? extends ZipEntry> it = zip.entries().asIterator();
      while (it.hasNext()) {
        ZipEntry e = it.next();
        if (!e.getName().startsWith("models/book/")
            || !e.getName().endsWith(".als")
            || TOO_SLOW_FOR_UNIT_TESTS.contains(e.getName())) {
          continue;
        }
        String code = new String(zip.getInputStream(e).readAllBytes(), StandardCharsets.UTF_8);
        if (code.matches("(?s).*\\bopen\\s+(?!util/).*")) {
          continue;
        }
        result.put(e.getName(), code);
      }
    }
    return result;
  }

  /**
   * Drops what legitimately differs between runs and hosts: generated ids, file names (temp file
   * vs. virtual path), build metadata, and error texts (they embed file paths). Only the
   * presence of an error is compared.
   */
  static JSONObject normalize(JSONObject value) {
    return (JSONObject) normalizeAny(value);
  }

  private static Object normalizeAny(Object value) {
    if (value instanceof JSONObject) {
      JSONObject in = (JSONObject) value;
      JSONObject out = new JSONObject();
      if (in.has("error")) {
        return out.put("error", true);
      }
      for (String key : in.keySet()) {
        if (key.equals("specId") || key.equals("filename") || key.equals("builddate")) {
          continue;
        }
        out.put(key, normalizeAny(in.get(key)));
      }
      return out;
    }
    if (value instanceof JSONArray) {
      JSONArray out = new JSONArray();
      for (Object o : (JSONArray) value) {
        out.put(normalizeAny(o));
      }
      return out;
    }
    if (value instanceof String && ((String) value).indexOf('│') >= 0) {
      return normalizeTable((String) value);
    }
    return value;
  }

  private static final String SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

  /**
   * Alloy's table view writes atoms as {@code Node⁰} on Unix and {@code Node$0} on Windows
   * ({@code TableView.toScriptedString}), which also changes column widths. Compare content only.
   * Must stay in sync with {@code normalizeTable} in {@code alloy-browser/scripts/parity-check.mjs}.
   */
  static String normalizeTable(String table) {
    StringBuilder sb = new StringBuilder();
    boolean inDigits = false;
    for (char c : table.toCharArray()) {
      int digit = SUPERSCRIPT_DIGITS.indexOf(c);
      if (digit >= 0) {
        if (!inDigits) {
          sb.append('$');
        }
        sb.append((char) ('0' + digit));
        inDigits = true;
      } else {
        sb.append(c);
        inDigits = false;
      }
    }
    return sb.toString().replaceAll("[─│┌┐└┘├┤┬┴┼]", " ").replaceAll("\\s+", " ").trim();
  }
}
