package de.buw.fmp.alloy.engine.model;

import edu.mit.csail.sdg.alloy4.Pos;
import edu.mit.csail.sdg.ast.Command;
import edu.mit.csail.sdg.ast.ExprConstant;
import edu.mit.csail.sdg.ast.ExprVar;
import edu.mit.csail.sdg.parser.CompModule;

/** Picks the command to execute, including the playground's special "default command" case. */
public final class CommandResolver {

  private CommandResolver() {}

  /**
   * Returns the command at {@code index}.
   *
   * <p>If the model has no explicit command, Alloy synthesizes a default one at an unknown
   * position. The playground replaces it by an explicit {@code run {} for 4} so the result is
   * labelled consistently.
   *
   * @throws IllegalArgumentException if the index does not refer to a command
   */
  public static Command resolve(CompModule module, int index) {
    if (index < 0 || index >= module.getAllCommands().size()) {
      throw new IllegalArgumentException(
          "Command index " + index + " out of range. The model has "
              + module.getAllCommands().size() + " command(s).");
    }
    Command command = module.getAllCommands().get(index);
    if (index == 0 && hasDefaultCommand(module)) {
      ExprVar runKeyword = ExprVar.make(Pos.UNKNOWN, "run");
      return new Command(
          Pos.UNKNOWN,
          ExprConstant.TRUE,
          "FMPlayDefault",
          false,
          4,
          4,
          4,
          -1,
          -1,
          -1,
          null,
          null,
          runKeyword,
          command.formula,
          null);
    }
    return command;
  }

  private static boolean hasDefaultCommand(CompModule module) {
    return module.getAllCommands().size() == 1
        && Pos.UNKNOWN.equals(module.getAllCommands().get(0).pos);
  }
}
