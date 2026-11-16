"""Re-check every claim of a diff result with fresh solvers.

The analysis in :mod:`semantic_diff` makes claims of several kinds (a witness
is a difference, a direction has no difference, an explanation entails the
rejection, a coverage is complete, ...).  :func:`certify` re-derives each claim
independently of the engine that produced it: with a fresh solver, from the
final formulas, without selectors or incremental state.  An empty list means
every claim was confirmed or could at least not be refuted (a fresh check that
times out is not counted as a refutation).

The certifier shares Z3 as its trusted base.  It therefore detects encoding
and bookkeeping errors (wrong formulas, wrong selectors, stale models, wrong
flags), not bugs inside Z3 itself.
"""

from typing import cast

from z3 import And, BoolRef, Context, ModelRef, Not, Z3_OP_UNINTERPRETED, is_false, is_true, sat, unsat

from .semantic_diff import DiffResult, DirectionResult, QueryPairResult, Relation
from .semantic_explainer import new_solver
from .z3_bridge import EncodedQuery

DEFAULT_CERTIFY_TIMEOUT_MS: int = 20_000


def _check(ctx: Context, timeout_ms: int | None, *formulas: BoolRef) -> str:
    """Return the fresh-solver status of the conjunction of ``formulas``."""

    solver = new_solver(ctx, timeout_ms)
    solver.add(*formulas)
    result = solver.check()
    return "sat" if result == sat else "unsat" if result == unsat else "unknown"


def _holds(model: ModelRef, formula: BoolRef) -> bool:
    """Return True when the completed model evaluates ``formula`` to true."""

    return is_true(model.evaluate(formula, model_completion=True))


def _refuted(model: ModelRef, formula: BoolRef, timeout_ms: int | None) -> bool:
    """Return True only when ``model`` provably does not satisfy ``formula``.

    Z3's evaluator may leave a quantified formula unreduced; that is not a
    refutation.  In that case the formula is checked with a fresh solver after
    fixing every constant of the model to its value: if even that is
    unsatisfiable, no structure agreeing with the model's constants (the model
    included) satisfies the formula.
    """

    value = model.evaluate(formula, model_completion=True)
    if is_true(value):
        return False
    if is_false(value):
        return True
    solver = new_solver(formula.ctx, timeout_ms)
    solver.add(formula)
    for declaration in model.decls():
        if declaration.arity() == 0 and declaration.kind() == Z3_OP_UNINTERPRETED:
            solver.add(declaration() == model.evaluate(declaration(), model_completion=True))
    return solver.check() == unsat


def certify_direction(direction: DirectionResult, base: EncodedQuery, compare: EncodedQuery, timeout_ms: int | None) -> list[str]:
    """Return the claims of one direction that a fresh check refutes."""

    ctx: Context = base.formula.ctx
    label: str = f"{direction.base_name} vs {direction.compare_name}"
    problems: list[str] = []
    region: BoolRef = cast(BoolRef, And(base.formula, Not(compare.formula)))
    if direction.status == "unsat" and _check(ctx, timeout_ms, region) == "sat":
        problems.append(f"{label}: claimed no divergence, but a fresh solver finds one")
    if direction.diverged != (direction.status == "sat"):
        problems.append(f"{label}: diverged flag disagrees with status {direction.status}")
    if direction.status == "unknown" and not direction.solver_unknown:
        problems.append(f"{label}: unknown status without solver_unknown flag")
    if direction.status != "sat":
        if direction.generalizations or direction.model is not None or direction.violated_assertions:
            problems.append(f"{label}: explanations reported without a divergence")
        return problems
    model: ModelRef | None = direction.model
    if model is None:
        return problems + [f"{label}: divergence without witness"]
    # Z3's evaluator can leave a quantified formula unreduced, and the result can depend on
    # earlier model completions; so a witness is rejected only when it is provably wrong.
    if direction.model_validated and _refuted(model, region, timeout_ms):
        problems.append(f"{label}: witness does not satisfy base AND NOT compare")
    if direction.model_validated and not direction.violated_assertions:
        problems.append(f"{label}: validated witness but no violated conjunct")
    compare_ids: set[int] = {entry.ast.get_id() for entry in compare.entries}
    for entry in direction.violated_assertions:
        if entry.ast.get_id() not in compare_ids or _refuted(model, cast(BoolRef, Not(entry.ast)), timeout_ms):
            problems.append(f"{label}: '{entry.text}' is reported violated but is not false under the witness")
    for index, generalization in enumerate(direction.generalizations, start=1):
        if _check(ctx, timeout_ms, base.formula, cast(BoolRef, generalization), compare.formula) == "sat":
            problems.append(f"{label}: {direction.base_name} AND E{index} does not entail NOT {direction.compare_name}")
    if direction.generalizations_minimal:
        for index, literals in enumerate(direction.generalization_literals, start=1):
            for position in range(len(literals)):
                rest: list[BoolRef] = list(literals[:position] + literals[position + 1:])
                if _check(ctx, timeout_ms, base.formula, compare.formula, *rest) == "unsat":
                    problems.append(f"{label}: E{index} is not minimal (literal {literals[position]} is redundant)")
    if direction.coverage_complete:
        blocked: list[BoolRef] = [cast(BoolRef, Not(generalization)) for generalization in direction.generalizations]
        if _check(ctx, timeout_ms, region, *blocked) == "sat":
            problems.append(f"{label}: coverage claimed complete but an uncovered difference exists")
    counterfactual: ModelRef | None = direction.counterfactual
    if counterfactual is not None:
        if _refuted(counterfactual, compare.formula, timeout_ms):
            problems.append(f"{label}: counterfactual is not accepted by {direction.compare_name}")
        if direction.counterfactual_target == "both" and _refuted(counterfactual, base.formula, timeout_ms):
            problems.append(f"{label}: counterfactual claimed to satisfy both versions but violates {direction.base_name}")
        if direction.counterfactual_target == "compare" and _check(ctx, timeout_ms, base.formula, compare.formula) == "sat":
            problems.append(f"{label}: claimed that no model satisfies both versions, but one exists")
    return problems


def certify_pair(pair: QueryPairResult, timeout_ms: int | None = DEFAULT_CERTIFY_TIMEOUT_MS) -> list[str]:
    """Return the claims of one query pair that a fresh check refutes."""

    if pair.encoded_a is None or pair.encoded_b is None:
        return ["pair carries no encoded formulas"]
    ctx: Context = pair.formula_a.ctx
    problems: list[str] = []
    for status, formula, name in ((pair.status_a, pair.formula_a, "A"), (pair.status_b, pair.formula_b, "B")):
        fresh: str = _check(ctx, timeout_ms, formula)
        if "unknown" not in (status, fresh) and status != fresh:
            problems.append(f"status of {name} is {status}, but a fresh solver says {fresh}")
    problems += certify_direction(pair.tightening, pair.encoded_a, pair.encoded_b, timeout_ms)
    problems += certify_direction(pair.relaxation, pair.encoded_b, pair.encoded_a, timeout_ms)
    if pair.relation is Relation.EQUIVALENT and (pair.tightening.diverged or pair.relaxation.diverged):
        problems.append("relation is equivalent although a direction diverged")
    return problems


def certify(result: DiffResult, timeout_ms: int | None = DEFAULT_CERTIFY_TIMEOUT_MS) -> list[str]:
    """Return every refuted claim of a diff result (empty when all claims hold)."""

    problems: list[str] = []
    for index, pair in enumerate(result.pairs, start=1):
        problems += [f"P{index}: {problem}" for problem in certify_pair(pair, timeout_ms)]
    return problems
