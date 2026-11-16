"""Convert ``smt_diff`` results and Z3 models into JSON-compatible data.

Version A of the library is the *previous* script, version B the *current* one.
"""

import re
from typing import Any

from smt_diff import DiffResult, DirectionResult, Explanation, QueryPairResult, UnmatchedQuery, ValueChange
from smt_diff.cli import INTERNAL_PREFIXES, format_model
from smt_diff.semantic_explainer import SemanticExplainer
from smt_diff.smt_parser import Query
from smt_diff.z3_bridge import AssertionEntry, CollisionDiagnostic
from z3 import Z3_OP_UNINTERPRETED, BoolRef, ExprRef, ModelRef, is_false, is_true

SIDES: dict[str, str] = {"A": "previous", "B": "current"}

DEFINE_FUN = re.compile(r"\(define-fun\s+(\|[^|]*\||[^\s()]+)")


def form_end(text: str, start: int) -> int:
    """Return the index after the S-expression starting at ``text[start] == '('``."""

    depth = 0
    index = start
    while index < len(text):
        char = text[index]
        if char in "\"|":
            closing = text.find(char, index + 1)
            # "" escapes a quote inside a string literal
            while char == '"' and closing != -1 and text.startswith('""', closing):
                closing = text.find('"', closing + 2)
            if closing == -1:
                return len(text)
            index = closing
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return index + 1
        index += 1
    return len(text)


def split_definitions(model_text: str) -> dict[str, str]:
    """Map each symbol of a model in SMT-LIB (``model.sexpr()``) to its ``define-fun``."""

    definitions: dict[str, str] = {}
    position = 0
    while (match := DEFINE_FUN.search(model_text, position)) is not None:
        end = form_end(model_text, match.start())
        definitions[match.group(1).strip("|")] = model_text[match.start():end]
        position = end
    return definitions


_PYTHON_BOOLEANS = re.compile(r"\b(True|False)\b")


def smt_spelling(text: str) -> str:
    """Spell the Booleans of Z3's Python-style output (``True``, ``[else -> False]``) as in SMT-LIB."""

    return _PYTHON_BOOLEANS.sub(lambda match: match.group(1).lower(), text)


def _value_text(value) -> str:
    if isinstance(value, ExprRef) and (is_true(value) or is_false(value)):
        return "true" if is_true(value) else "false"
    return smt_spelling(str(value))


def model_to_dict(model: ModelRef | None, sides: dict[str, str] | None = None) -> dict[str, Any] | None:
    """Return the user symbols of a model; ``sides`` labels symbols by version.

    Each assignment carries its value as printed by Z3 and its ``define-fun``
    in SMT-LIB; ``smtlib`` is the model without internal symbols.
    """

    if model is None:
        return None
    definitions = split_definitions(model.sexpr())
    assignments: list[dict[str, Any]] = []
    for decl in sorted(model.decls(), key=lambda item: item.name()):
        if decl.name().startswith(INTERNAL_PREFIXES) or decl.kind() != Z3_OP_UNINTERPRETED:
            continue
        assignment: dict[str, Any] = {
            "name": decl.name(),
            "arity": decl.arity(),
            "value": _value_text(model[decl]),
            "smtlib": definitions.get(decl.name(), ""),
        }
        if sides is not None:
            assignment["side"] = sides.get(decl.name(), "shared")
        assignments.append(assignment)
    return {
        "assignments": assignments,
        "text": smt_spelling(format_model(model)),
        "smtlib": "\n".join(item["smtlib"] for item in assignments if item["smtlib"]),
    }


def witness_to_dict(stream, model: ModelRef | None) -> dict[str, Any] | None:
    """Return a model of a ``WitnessStream``, labelling each symbol previous, current or shared."""

    sides = {name: "previous" for name in stream.previous_only} | {name: "current" for name in stream.current_only}
    return model_to_dict(model, sides)


def query_to_dict(query: Query) -> dict[str, Any]:
    return {"index": query.index, "kind": query.kind, "line": query.line, "description": query.describe()}


def entry_to_dict(entry: AssertionEntry) -> dict[str, Any]:
    return {"text": entry.text, "kind": entry.kind, "line": entry.line, "command_index": entry.command_index, "level": entry.level}


def formula_to_dict(formula: ExprRef | None, literals: tuple[BoolRef, ...] = ()) -> dict[str, Any] | None:
    """Return a formula as readable text, SMT-LIB, and its literals (for a conjunction of literals)."""

    if formula is None:
        return None
    return {
        "text": SemanticExplainer.format_explanation(formula),
        "smtlib": formula.sexpr(),
        "literals": [{"text": SemanticExplainer.humanize_predicate(literal), "smtlib": literal.sexpr()} for literal in literals],
    }


def change_to_dict(change: ValueChange) -> dict[str, str]:
    return {"symbol": change.symbol, "before": smt_spelling(change.before), "after": smt_spelling(change.after)}


def collision_to_dict(collision: CollisionDiagnostic) -> dict[str, Any]:
    return {
        "symbol": collision.symbol,
        "message": collision.message,
        "previous_signature": collision.left_signature,
        "current_signature": collision.right_signature,
        "renamed_to": collision.renamed_to,
    }


def _coverage(complete: bool, unknown: bool, limit_reached: bool) -> str:
    if complete:
        return "complete"
    if unknown:
        return "unknown"
    if limit_reached:
        return "limit-reached"
    return "incomplete"


def _generalizations(formulas: tuple[ExprRef, ...], literal_sets: tuple[tuple[BoolRef, ...], ...]) -> list[dict[str, Any] | None]:
    return [formula_to_dict(formula, literal_sets[index] if index < len(literal_sets) else ()) for index, formula in enumerate(formulas)]


def direction_to_dict(direction: DirectionResult) -> dict[str, Any]:
    explained = direction.counterfactual_status is not None
    return {
        "base": direction.base_name,
        "compare": direction.compare_name,
        "status": direction.status,
        "diverged": direction.diverged,
        "reason_unknown": direction.reason_unknown,
        "witness": model_to_dict(direction.model),
        "witness_validated": direction.model_validated,
        "violated_assertions": [entry_to_dict(entry) for entry in direction.violated_assertions],
        "undetermined_assertions": [entry_to_dict(entry) for entry in direction.undetermined_assertions],
        "abduction": {
            "explanation": formula_to_dict(direction.explanation, direction.generalization_literals[0] if direction.generalization_literals else ()),
            "generalizations": _generalizations(direction.generalizations, direction.generalization_literals),
            "coverage": _coverage(direction.coverage_complete, direction.coverage_unknown, direction.generalization_limit_reached),
            "uncovered_witness": model_to_dict(direction.uncovered_model),
            "minimal": direction.generalizations_minimal,
        } if explained else None,
        "counterfactual": {
            "status": direction.counterfactual_status,
            "target": direction.counterfactual_target,
            "model": model_to_dict(direction.counterfactual),
            "changes": [change_to_dict(change) for change in direction.change_details],
            "validated": direction.counterfactual_validated,
            "optimized": direction.counterfactual_optimized,
            "note": direction.counterfactual_note,
        } if explained else None,
    }


def pair_to_dict(index: int, pair: QueryPairResult) -> dict[str, Any]:
    return {
        "index": index,
        "query_a": query_to_dict(pair.query_a),
        "query_b": query_to_dict(pair.query_b),
        "status_a": pair.status_a,
        "status_b": pair.status_b,
        "relation": pair.relation.value,
        "collisions": [collision_to_dict(collision) for collision in pair.collisions],
        "private_symbols_a": list(pair.private_symbols_a),
        "private_symbols_b": list(pair.private_symbols_b),
        "tightening": direction_to_dict(pair.tightening),
        "relaxation": direction_to_dict(pair.relaxation),
    }


def unmatched_to_dict(entry: UnmatchedQuery) -> dict[str, Any]:
    return {"side": entry.side, "query": query_to_dict(entry.query), "status": entry.status}


def diff_result_to_dict(result: DiffResult) -> dict[str, Any]:
    return {
        "sides": SIDES,
        "equivalent": result.equivalent,
        "matching": result.matching,
        "encoding": result.encoding,
        "diagnostics": list(result.parser_diagnostics),
        "pairs": [pair_to_dict(index, pair) for index, pair in enumerate(result.pairs)],
        "unmatched": [unmatched_to_dict(entry) for entry in result.unmatched_a + result.unmatched_b],
    }


def explanation_to_dict(explanation: Explanation, to_model) -> dict[str, Any]:
    """Return the abduction and counterfactual parts of an explanation; ``to_model`` serializes models."""

    counterfactual = explanation.counterfactual
    generalizations = _generalizations(explanation.generalizations, explanation.generalization_literals)
    return {
        "abduction": {
            "explanation": generalizations[0] if generalizations else None,
            "generalizations": generalizations,
            "coverage": _coverage(explanation.coverage_complete, explanation.coverage_unknown, explanation.limit_reached),
            "uncovered_witness": to_model(explanation.uncovered_model),
            "minimal": explanation.minimal,
        },
        "counterfactual": {
            "status": counterfactual.status,
            "target": counterfactual.target,
            "model": to_model(counterfactual.model),
            "changes": [change_to_dict(change) for change in explanation.changes],
            "validated": counterfactual.validated,
            "optimized": counterfactual.optimized,
            "note": counterfactual.note,
        },
    }
