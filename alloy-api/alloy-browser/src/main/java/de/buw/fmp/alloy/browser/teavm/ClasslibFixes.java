package de.buw.fmp.alloy.browser.teavm;

import java.util.List;
import org.teavm.model.ValueType;
import org.teavm.model.emit.ProgramEmitter;
import org.teavm.model.emit.ValueEmitter;

/**
 * Corrections for bugs in TeaVM's Java class library that change the analyzer's results.
 *
 * <p>Each fix is covered by {@code BrowserEngineSmokeTest} / the parity checks in {@code
 * alloy-browser}; remove an entry once the corresponding TeaVM version is fixed upstream.
 */
final class ClasslibFixes {

  private ClasslibFixes() {}

  private static final String LIST = "java.util.LinkedList";
  private static final String ITERATOR = "java.util.LinkedList$SequentialListIterator";
  private static final String ENTRY = "java.util.LinkedList$Entry";

  static final List<MethodPatch> PATCHES =
      List.of(MethodPatch.replace(ITERATOR, "remove", ClasslibFixes::linkedListIteratorRemove));

  /**
   * {@code LinkedList.listIterator().remove()} (TeaVM 0.16.0).
   *
   * <p>The original recomputes the iterator's cursor from the <em>remaining</em> neighbours and
   * falls back to {@code null} at either end of the list. Removing the last element after {@code
   * next()} therefore loses the cursor's predecessor, and a subsequent {@code add()} unlinks the
   * rest of the list while {@code size()} stays unchanged. Kodkod's symmetry detection does
   * exactly that, which made every non-trivial analysis fail. Example: {@code [1, 2]}, {@code
   * next(); next(); remove(); add(7)} yields {@code [7]} (size 2) instead of {@code [1, 7]}.
   *
   * <p>Replacement (the standard algorithm, which captures the neighbours before unlinking):
   *
   * <pre>{@code
   * if (currentEntry == null) throw new IllegalStateException();
   * Entry removed = currentEntry, before = removed.previous, after = removed.next;
   * LinkedList.this.removeEntry(removed);
   * if (removed == prevEntry) { prevEntry = before; index--; }      // after next()
   * else if (removed == nextEntry) { nextEntry = after; }          // after previous()
   * version = LinkedList.this.modCount;
   * currentEntry = null;
   * }</pre>
   */
  private static void linkedListIteratorRemove(ProgramEmitter pe, org.teavm.model.MethodHolder m) {
    ValueType entryType = ValueType.object(ENTRY);
    ValueEmitter self = pe.var(0, ValueType.object(ITERATOR));

    ValueEmitter removed = self.getField("currentEntry", entryType);
    pe.when(removed.isNull())
        .thenDo(() -> pe.construct(IllegalStateException.class).raise());

    ValueEmitter before = removed.getField("previous", entryType);
    ValueEmitter after = removed.getField("next", entryType);
    ValueEmitter owner = self.getField("this$0", ValueType.object(LIST));
    owner.invokeSpecial("removeEntry", removed);

    pe.when(removed.isSame(self.getField("prevEntry", entryType)))
        .thenDo(
            () -> {
              self.setField("prevEntry", before);
              self.setField("index", self.getField("index", ValueType.INTEGER).sub(1));
            })
        .elseDo(
            () ->
                pe.when(removed.isSame(self.getField("nextEntry", entryType)))
                    .thenDo(() -> self.setField("nextEntry", after)));

    self.setField("version", owner.getField("modCount", ValueType.INTEGER));
    self.setField("currentEntry", pe.constantNull(entryType));
    pe.exit();
  }
}
