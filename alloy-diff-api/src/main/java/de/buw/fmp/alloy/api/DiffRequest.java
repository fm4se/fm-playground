package de.buw.fmp.alloy.api;

/**
 * Request Data Transfer Object (DTO) for Alloy diff checking API endpoints.
 */
public class DiffRequest {
  private String leftCode;
  private String rightCode;
  private String analysis = "SemDiff";
  private int scope = -1;
  private boolean withPred = true;
  private int cmdIndex1 = -1;
  private int cmdIndex2 = -1;

  public String getLeftCode() {
    return leftCode;
  }

  public void setLeftCode(String leftCode) {
    this.leftCode = leftCode;
  }

  public String getRightCode() {
    return rightCode;
  }

  public void setRightCode(String rightCode) {
    this.rightCode = rightCode;
  }

  public String getAnalysis() {
    return analysis;
  }

  public void setAnalysis(String analysis) {
    this.analysis = analysis;
  }

  public int getScope() {
    return scope;
  }

  public void setScope(int scope) {
    this.scope = scope;
  }

  public boolean isWithPred() {
    return withPred;
  }

  public void setWithPred(boolean withPred) {
    this.withPred = withPred;
  }

  public int getCmdIndex1() {
    return cmdIndex1;
  }

  public void setCmdIndex1(int cmdIndex1) {
    this.cmdIndex1 = cmdIndex1;
  }

  public int getCmdIndex2() {
    return cmdIndex2;
  }

  public void setCmdIndex2(int cmdIndex2) {
    this.cmdIndex2 = cmdIndex2;
  }
}
