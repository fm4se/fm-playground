package de.buw.fmp.alloy.engine.model;

import de.buw.fmp.alloy.engine.stdlib.AlloyStdlib;
import edu.mit.csail.sdg.alloy4.A4Reporter;
import edu.mit.csail.sdg.alloy4.Err;
import edu.mit.csail.sdg.alloy4.Util;
import edu.mit.csail.sdg.parser.CompModule;
import edu.mit.csail.sdg.parser.CompUtil;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Parses and type-checks an Alloy model held in memory, without touching the file system.
 *
 * <p>{@link CompUtil#parseEverything_fromFile} accepts a map of pre-loaded sources keyed by file
 * path. We pass the user's model under a virtual path and the Alloy standard library under the
 * paths the parser derives for {@code open util/...} relative to that model. Lookups hit the map
 * before the disk would be consulted, so the same code runs on the JVM and in the browser.
 *
 * <p>The keys must be real {@code .als} paths: Alloy implicitly opens {@code util/integer} in
 * every module whose file name does not end in {@code util/integer.als}, so a key like {@code
 * util/integer} would make the integer library import itself.
 */
public final class AlloyModelParser {

  /** Virtual directory of the user's model. */
  private static final String MODEL_DIR = "/fmp/";

  /** Virtual location of the user's model. Must end in {@code .als} (the UI relies on it). */
  static final String MODEL_FILE = MODEL_DIR + "model.als";

  /**
   * Library paths are resolved relative to the model's directory, or relative to the root when
   * the model declares a nested module name ({@code module a/b}); provide both.
   */
  private static final String[] LIBRARY_ROOTS = {MODEL_DIR, "/"};

  private static volatile Map<String, String> libraryByPath;

  private AlloyModelParser() {}

  public static CompModule parse(String code) throws Err {
    String modelPath = Util.canon(MODEL_FILE);
    Map<String, String> sources = new LinkedHashMap<>(libraryByPath());
    sources.put(modelPath, code);
    return CompUtil.parseEverything_fromFile(A4Reporter.NOP, sources, modelPath);
  }

  /** Standard library keyed by canonical path, computed once per platform. */
  static Map<String, String> libraryByPath() {
    Map<String, String> result = libraryByPath;
    if (result == null) {
      Map<String, String> paths = new LinkedHashMap<>();
      for (String root : LIBRARY_ROOTS) {
        for (Map.Entry<String, String> module : AlloyStdlib.modules().entrySet()) {
          paths.put(Util.canon(root + module.getKey() + ".als"), module.getValue());
        }
      }
      result = Collections.unmodifiableMap(paths);
      libraryByPath = result;
    }
    return result;
  }
}
