"""Worker functions run by :func:`smt_diff_api.runner.run_with_timeout`.

They take and return plain data, because they run in a separate process.
"""

from typing import Any

from smt_diff import Relation, SemanticDiffTool, classify_assertions, explain_divergence
from smt_diff.semantic_explainer import new_solver, status_name
from z3 import Not

from .serialize import SIDES, diff_result_to_dict, entry_to_dict, explanation_to_dict, query_to_dict, witness_to_dict
from .witnesses import FilterError, InvalidPair, encode_selected_pair, open_stream


def analyze_scripts(
    previous: str,
    current: str,
    *,
    matching: str,
    encoding: str,
    explain: bool,
    solver_timeout_ms: int,
) -> dict[str, Any]:
    """Compare the previous script (A) with the current one (B), query by query."""

    tool = SemanticDiffTool(
        previous, current, matching=matching, encoding=encoding, explain=explain, timeout_ms=solver_timeout_ms,
    )
    return diff_result_to_dict(tool.analyze())


def semantic_relation(previous: str, current: str, *, solver_timeout_ms: int) -> str:
    """Return the ``Relation`` value of the last queries: ``tightened`` when the current one accepts fewer models."""

    pair = encode_selected_pair(previous, current, None)

    def check(base, compare) -> str:
        solver = new_solver(pair.ctx, solver_timeout_ms)
        solver.add(base, Not(compare))
        return status_name(solver.check())

    previous_not_current = check(pair.a.formula, pair.b.formula)
    current_not_previous = check(pair.b.formula, pair.a.formula)
    if "unknown" in (previous_not_current, current_not_previous):
        return Relation.UNKNOWN.value
    return {
        ("unsat", "unsat"): Relation.EQUIVALENT,
        ("sat", "unsat"): Relation.TIGHTENED,
        ("unsat", "sat"): Relation.RELAXED,
        ("sat", "sat"): Relation.INCOMPARABLE,
    }[(previous_not_current, current_not_previous)].value


def explain_witness(
    previous: str,
    current: str,
    *,
    mode: str,
    pair: int | None,
    matching: str,
    filter: str,
    witness: int,
    solver_timeout_ms: int,
) -> dict[str, Any]:
    """Explain the ``witness``-th model (from 0) of a ``tightening`` or ``relaxation`` enumeration.

    The enumeration is replayed with the same scripts, pair and filter, so the
    witness is the one ``/run`` + ``/next`` (or ``/witnesses``) returned.
    Errors the client can fix are returned as ``{"error": {...}}``.
    """

    if mode not in ("tightening", "relaxation"):
        return {"error": {"code": "invalid_mode", "message": f"cannot explain mode '{mode}'; use tightening or relaxation", "script": None}}
    try:
        stream = open_stream(previous, current, mode, pair=pair, matching=matching, filter=filter, solver_timeout_ms=solver_timeout_ms)
    except FilterError as error:
        return {"error": {"code": "filter_error", "message": str(error), "script": None}}
    except InvalidPair as error:
        return {"error": {"code": "invalid_pair", "message": str(error), "script": None}}
    model = None
    for _ in range(witness + 1):
        model = stream.next()
        if model is None:
            message = "the solver could not decide the region" if stream.incomplete else f"there is no witness #{witness + 1}"
            return {"error": {"code": "witness_not_found", "message": message, "script": None}}
    base, compare = (stream.pair.a, stream.pair.b) if mode == "tightening" else (stream.pair.b, stream.pair.a)
    violated, undetermined = classify_assertions(compare, model)
    explanation = explain_divergence(base.formula, compare.formula, model, timeout_ms=solver_timeout_ms)
    base_side, compare_side = ("A", "B") if mode == "tightening" else ("B", "A")
    return {
        "mode": mode,
        "witness_index": witness,
        "base": SIDES[base_side],
        "compare": SIDES[compare_side],
        "query_a": query_to_dict(stream.query_a),
        "query_b": query_to_dict(stream.query_b),
        "witness": witness_to_dict(stream, model),
        "violated_assertions": [entry_to_dict(entry) for entry in violated],
        "undetermined_assertions": [entry_to_dict(entry) for entry in undetermined],
        **explanation_to_dict(explanation, lambda item: witness_to_dict(stream, item)),
    }
