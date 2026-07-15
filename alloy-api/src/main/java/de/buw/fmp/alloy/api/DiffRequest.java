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
}
