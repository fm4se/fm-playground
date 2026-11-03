package de.buw.fmp.alloy.browser.teavm;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.teavm.model.ClassHolder;
import org.teavm.model.ClassHolderTransformer;
import org.teavm.model.ClassHolderTransformerContext;
import org.teavm.model.ElementModifier;
import org.teavm.model.MethodHolder;
import org.teavm.model.emit.ProgramEmitter;

/** Applies {@link MethodPatch}es while TeaVM loads classes. */
final class MethodPatchTransformer implements ClassHolderTransformer {

  private final Map<String, List<MethodPatch>> patchesByClass = new HashMap<>();

  MethodPatchTransformer(List<MethodPatch> patches) {
    for (MethodPatch patch : patches) {
      patchesByClass.computeIfAbsent(patch.className, k -> new ArrayList<>()).add(patch);
    }
  }

  @Override
  public void transformClass(ClassHolder cls, ClassHolderTransformerContext context) {
    List<MethodPatch> patches = patchesByClass.get(cls.getName());
    if (patches == null) {
      return;
    }
    for (MethodHolder method : cls.getMethods()) {
      if (method.hasModifier(ElementModifier.ABSTRACT)
          || method.hasModifier(ElementModifier.NATIVE)) {
        continue;
      }
      for (MethodPatch patch : patches) {
        if (patch.methodName.equals(method.getName())) {
          ProgramEmitter pe = ProgramEmitter.create(method, context.getHierarchy());
          patch.body.emit(pe, method);
          break;
        }
      }
    }
  }
}
