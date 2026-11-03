package de.buw.fmp.alloy.browser.teavm;

import java.util.ArrayList;
import java.util.List;
import org.teavm.vm.spi.TeaVMHost;
import org.teavm.vm.spi.TeaVMPlugin;

/**
 * Compile-time TeaVM plugin (registered via {@code META-INF/services}). It is executed by the
 * TeaVM compiler only and never becomes part of the generated WebAssembly/JavaScript.
 *
 * <ul>
 *   <li>{@link BrowserStubs}: unreachable code that references JDK APIs TeaVM lacks;
 *   <li>{@link ClasslibFixes}: corrections of TeaVM class-library bugs.
 * </ul>
 */
public final class AlloyBrowserPlugin implements TeaVMPlugin {

  @Override
  public void install(TeaVMHost host) {
    List<MethodPatch> patches = new ArrayList<>(BrowserStubs.PATCHES);
    patches.addAll(ClasslibFixes.PATCHES);
    host.add(new MethodPatchTransformer(patches));
  }
}
