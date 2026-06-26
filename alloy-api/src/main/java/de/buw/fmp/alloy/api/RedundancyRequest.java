package de.buw.fmp.alloy.api;

/**
 * Request Data Transfer Object (DTO) for redundancy checking API endpoints.
 */
public class RedundancyRequest {
  private String code;
  private int cmdId = -1; // -1 means global (all commands)
  private int constraintId = -1; // -1 means not specified
  private int cursorPos = -1; // cursor position for explain (1-based)

  public String getCode() {
    return code;
  }

  public void setCode(String code) {
    this.code = code;
  }

  public int getCmdId() {
    return cmdId;
  }

  public void setCmdId(int cmdId) {
    this.cmdId = cmdId;
  }

  public int getConstraintId() {
    return constraintId;
  }

  public void setConstraintId(int constraintId) {
    this.constraintId = constraintId;
  }

  public int getCursorPos() {
    return cursorPos;
  }

  public void setCursorPos(int cursorPos) {
    this.cursorPos = cursorPos;
  }
}
