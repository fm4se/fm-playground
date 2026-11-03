package de.buw.fmp.alloy.engine.json;

import edu.mit.csail.sdg.alloy4.Pos;
import org.json.JSONObject;

/** Helpers for the JSON wire format shared by the REST API and the browser engine. */
public final class JsonResponses {

  public static final int OK = 200;
  public static final int BAD_REQUEST = 400;

  private JsonResponses() {}

  /** {@code {"error": message, "status": 400}}. */
  public static JSONObject error(String message) {
    JSONObject obj = new JSONObject();
    obj.put("error", message);
    obj.put("status", BAD_REQUEST);
    return obj;
  }

  /** The message of a throwable, falling back to its type when it has none. */
  public static String messageOf(Throwable t) {
    String message = t.getMessage();
    return message != null ? message : t.toString();
  }

  /** Line/column span of a position. */
  public static JSONObject position(Pos p) {
    JSONObject obj = new JSONObject();
    if (p != null) {
      obj.put("startLine", p.y);
      obj.put("startCol", p.x);
      obj.put("endLine", p.y2);
      obj.put("endCol", p.x2);
    }
    return obj;
  }

  /** Source text covered by {@code p}, or an empty string if it cannot be extracted. */
  public static String sourceText(String code, Pos p) {
    if (p == null || code == null) {
      return "";
    }
    try {
      return p.substring(code);
    } catch (RuntimeException e) {
      return "";
    }
  }
}
