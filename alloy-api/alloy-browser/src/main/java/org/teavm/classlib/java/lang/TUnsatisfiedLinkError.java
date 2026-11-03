package org.teavm.classlib.java.lang;

/**
 * Emulation of {@link java.lang.UnsatisfiedLinkError}, which TeaVM's class library lacks.
 *
 * <p>Alloy and Kodkod only mention it in {@code catch} clauses around native solver loading. It
 * is never thrown in the browser, but the class must exist for those handlers to compile. TeaVM
 * maps {@code java.lang.X} to {@code org.teavm.classlib.java.lang.TX} on the class path.
 */
public class TUnsatisfiedLinkError extends TLinkageError {

  public TUnsatisfiedLinkError() {
    super();
  }

  public TUnsatisfiedLinkError(String message) {
    super(message);
  }
}
