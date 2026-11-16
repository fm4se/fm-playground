"""Command-line front end for the SMT-LIB semantic diff."""

import argparse
import difflib
import sys
from pathlib import Path
from typing import Sequence

from z3 import Z3_OP_UNINTERPRETED, ModelRef

from .certify import certify
from .query_matching import STRATEGIES
from .semantic_diff import (
    DEFAULT_TIMEOUT_MS,
    ENCODINGS,
    DiffResult,
    DirectionResult,
    QueryPairResult,
    Relation,
    SemanticDiffTool,
    UnmatchedQuery,
)
from .semantic_explainer import SemanticExplainer
from .smt_parser import ScriptError
from .z3_bridge import AssertionEntry

INTERNAL_PREFIXES: tuple[str, ...] = ("smtdiff_selector!", "smtdiff_query!")
RELATION_TEXT: dict[Relation, str] = {
    Relation.EQUIVALENT: "EQUIVALENT (both queries accept exactly the same models)",
    Relation.TIGHTENED: "TIGHTENED (B accepts strictly fewer models than A)",
    Relation.RELAXED: "RELAXED (B accepts strictly more models than A)",
    Relation.INCOMPARABLE: "INCOMPARABLE (each version accepts models the other rejects)",
    Relation.UNKNOWN: "UNKNOWN (the solver could not decide at least one direction)",
}


def format_model(model: ModelRef | None) -> str:
    """Render a model's user symbols, hiding selector literals and Z3-internal functions."""

    if model is None:
        return "(none)"
    shown: list[str] = []
    for declaration in sorted(model.decls(), key=lambda item: item.name()):
        if declaration.name().startswith(INTERNAL_PREFIXES) or declaration.kind() != Z3_OP_UNINTERPRETED:
            continue
        shown.append(f"{declaration.name()} = {model[declaration]}")
    return "[" + ", ".join(shown) + "]"


def _describe_entry(entry: AssertionEntry) -> str:
    """Render one violated conjunct with its source location."""

    if entry.kind == "assumption":
        return f"Assumption {entry.text} of check-sat-assuming at command #{entry.command_index} (line {entry.line})"
    return f"Command #{entry.command_index} (line {entry.line}): {entry.text}"


def render_direction(result: DirectionResult, section: str) -> None:
    """Print one directional result using the CLI's human-readable format."""

    print("\n" + "-" * 70)
    print(section)
    if result.solver_unknown:
        reason: str = f" (reason: {result.reason_unknown})" if result.reason_unknown else ""
        print(f"  -> ANALYSIS INCONCLUSIVE: the solver could not determine divergence between {result.base_name} and {result.compare_name}{reason}.")
        return
    if not result.diverged:
        print(f"  -> No divergence detected. Every model of {result.base_name} is accepted by {result.compare_name}.")
        return
    print(f"  -> DIVERGENCE FOUND: {result.base_name} allows models that {result.compare_name} rejects.")
    print(f"\n  • Concrete Counterexample Testcase:\n    {format_model(result.model)}")
    if not result.model_validated:
        print("    (Z3's model evaluator could not fully confirm this witness, e.g. because of quantifiers.)")
    print(f"\n  • Syntactic Cause (Violated conjuncts of {result.compare_name}):")
    if result.violated_assertions:
        for entry in result.violated_assertions:
            print(f"    - {_describe_entry(entry)}")
    else:
        print("    - (No single conjunct evaluates to false under the witness)")
    for entry in result.undetermined_assertions:
        print(f"    ? {_describe_entry(entry)} (truth value not determined by the model)")
    if result.counterfactual_status is None:
        return  # explanations were disabled
    print(f"\n  • Abductive Explanation (every model of {result.base_name} satisfying it is rejected by {result.compare_name}):")
    print(f"    {SemanticExplainer.format_explanation(result.explanation)}")
    print("\n  • Global Difference Coverage:")
    for index, generalization in enumerate(result.generalizations, start=1):
        print(f"    E{index}: {SemanticExplainer.format_explanation(generalization)}")
    if result.coverage_complete:
        print(f"    Coverage complete: {result.base_name} AND NOT {result.compare_name} == {result.base_name} AND (E1 OR ... OR En).")
    elif result.coverage_unknown:
        print("    Coverage unknown; the solver could not decide an intermediate step.")
    elif result.generalization_limit_reached:
        print(f"    Coverage incomplete; the generalization limit was reached. Uncovered witness: {format_model(result.uncovered_model)}")
    else:
        print(f"    Coverage incomplete; an uncovered difference witness remains: {format_model(result.uncovered_model)}")
    print("\n  • Counterfactual Explanation (Minimal Change to Agree):")
    if result.counterfactual is not None:
        target: str = {
            "both": "both versions",
            "compare": f"{result.compare_name} (no model satisfies both versions)",
        }.get(result.counterfactual_target or "", f"{result.compare_name} (unknown whether a model of both versions exists)")
        no_change: str = "(no difference among the compared symbols; the models differ only in model-local values)"
        print(f"    Suggested Edit: {', '.join(result.changes) if result.changes else no_change}")
        print(f"    Nearest model accepted by {target}: {format_model(result.counterfactual)}")
        if result.counterfactual_note:
            print(f"    (Not distance-minimal: {result.counterfactual_note}.)")
        elif not result.counterfactual_optimized:
            print("    (The optimizer does not support these constraints: the model is a witness, not distance-minimal.)")
    elif result.counterfactual_status == "unknown":
        print("    (The optimizer could not decide; no counterfactual model reported)")
    else:
        print("    (No nearby counterfactual model found)")


def _signature_notes(pair: QueryPairResult) -> None:
    """Print collisions and symbols that only one version declares."""

    for collision in pair.collisions:
        renamed: str = f"; B's symbol compared as '{collision.renamed_to}'" if collision.renamed_to else ""
        marker: str = "!" if collision.changes_vocabulary else "i"
        print(f"  {marker} Symbol '{collision.symbol}': {collision.message}{renamed}")
        print(f"      A: {collision.left_signature}")
        print(f"      B: {collision.right_signature}")
    if pair.signature_changed:
        print("  ! Signature changed: renamed symbols are different symbols, each unconstrained in the other version.")
        print("    The relation and the witnesses below are over the union of both signatures.")
    if pair.private_symbols_a:
        print(f"  i Only A constrains: {', '.join(pair.private_symbols_a)} (unconstrained in B)")
    if pair.private_symbols_b:
        print(f"  i Only B constrains: {', '.join(pair.private_symbols_b)} (unconstrained in A)")


def _unmatched(entry: UnmatchedQuery) -> str:
    """Describe a query without counterpart."""

    other: str = "B" if entry.side == "A" else "A"
    return f"Version {entry.side} {entry.query.describe()} has no counterpart in version {other} (status: {entry.status})"


def render(result: DiffResult, script_a: str, script_b: str) -> None:
    """Print the textual diff, the query matching, and both semantic directions of every pair."""

    print("=" * 70)
    print("                     HYBRID SMT-LIB SEMANTIC DIFF")
    print("=" * 70)
    print("\n[1] SYNTACTIC CHANGES (Textual Diff):")
    a_lines: list[str] = [line for line in script_a.splitlines() if line.strip()]
    b_lines: list[str] = [line for line in script_b.splitlines() if line.strip()]
    line: str
    for line in difflib.ndiff(a_lines, b_lines):
        if line.startswith(("- ", "+ ")):
            print(f"  {line}")
    # Ablation options are shown only when they differ from the reference configuration.
    ablations: str = "".join([
        ", semantics: one-set" if result.semantics == "one-set" else "",
        ", translations: off" if not result.translate else "",
    ])
    print(f"\n[2] QUERY MATCHING (strategy: {result.matching}, encoding: {result.encoding}{ablations}):")
    for message in result.parser_diagnostics:
        print(f"  {message}")
    if result.logic_fallbacks:
        print(f"  [Info] {result.logic_fallbacks} check(s) were undecided for {result.logic} and repeated with Z3's default solver")
    for index, pair in enumerate(result.pairs, start=1):
        print(f"  P{index}: A {pair.query_a.describe()}  <->  B {pair.query_b.describe()}")
        print(f"      status A: {pair.status_a}, status B: {pair.status_b}; {pair.relation.value}")
    for entry in result.unmatched_a + result.unmatched_b:
        print(f"  {_unmatched(entry)}")
    for index, pair in enumerate(result.pairs, start=1):
        print("\n" + "=" * 70)
        print(f"PAIR P{index}: A {pair.query_a.describe()}  <->  B {pair.query_b.describe()}")
        print(f"  Relation: {RELATION_TEXT[pair.relation]}")
        _signature_notes(pair)
        render_direction(pair.tightening, f"[P{index}.1] SEMANTIC TIGHTENING / REGRESSIONS (Allowed in A, Forbidden in B):")
        render_direction(pair.relaxation, f"[P{index}.2] SEMANTIC RELAXATIONS / EXPANSIONS (Allowed in B, Forbidden in A):")
    print("\n" + "=" * 70)
    verdict: bool | None = result.equivalent
    if verdict is True:
        print("VERDICT: the scripts pose semantically equivalent query sequences.")
    elif verdict is False:
        print("VERDICT: the scripts differ semantically.")
    else:
        print("VERDICT: inconclusive; the solver could not decide every comparison.")
    if result.time_budget_reached:
        print("NOTE: the time budget ran out; some explanations or counterfactuals are incomplete.")
    print("=" * 70)


def main(argv: Sequence[str] | None = None) -> int:
    """Compare two SMT-LIB files supplied on the command line."""

    parser: argparse.ArgumentParser = argparse.ArgumentParser(prog="smt-diff", description="Compare two SMT-LIB scripts.")
    parser.add_argument("script_a", nargs="?", help="path to the first SMT-LIB script")
    parser.add_argument("script_b", nargs="?", help="path to the second SMT-LIB script")
    parser.add_argument("--match", choices=STRATEGIES, default="align", help="how check-sat queries are paired (default: align)")
    parser.add_argument("--encoding", choices=ENCODINGS, default="direct", help="how queries are decided (default: direct)")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_MS, help="per-solver-call timeout in ms (0 disables)")
    parser.add_argument("--no-explain", action="store_true", help="skip abductive explanations and counterfactuals")
    parser.add_argument("--certify", action="store_true", help="re-check every reported claim with fresh solvers")
    parser.add_argument("--one-set", action="store_true", help="ablation: compare only the final assertion stack of each script")
    parser.add_argument("--no-translate", action="store_true", help="ablation: rename Int/Real and declared/defined symbol changes apart")
    parser.add_argument("--time-budget", type=float, default=None, metavar="SECONDS",
                        help="wall-clock budget for explanations and counterfactuals (default: none)")
    parser.add_argument("--ignore-logic", action="store_true",
                        help="use Z3's default solver instead of the least upper bound of the two set-logic commands")
    args: argparse.Namespace = parser.parse_args(argv)
    if args.script_a is None and args.script_b is None:
        print("Usage: smt-diff <script-a.smt2> <script-b.smt2>")
        return 0
    if args.script_a is None or args.script_b is None:
        parser.error("both script paths are required")
    script_a: str = Path(args.script_a).read_text(encoding="utf-8")
    script_b: str = Path(args.script_b).read_text(encoding="utf-8")
    try:
        analysis_tool: SemanticDiffTool = SemanticDiffTool(
            script_a, script_b, matching=args.match, encoding=args.encoding,
            explain=not args.no_explain, timeout_ms=args.timeout,
            semantics="one-set" if args.one_set else "queries", translate=not args.no_translate,
            time_budget_s=args.time_budget, use_logic=not args.ignore_logic,
        )
        result: DiffResult = analysis_tool.analyze()
    except ScriptError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    render(result, script_a, script_b)
    if args.certify:
        problems: list[str] = certify(result)
        if problems:
            print("CERTIFICATION FAILED:")
            for problem in problems:
                print(f"  - {problem}")
            return 1
        print("CERTIFICATION: every reported claim was re-checked with fresh solvers.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
