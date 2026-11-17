import re
from typing import Any

from .cache_manager import cache_manager
from .limboole_executor import process_commands


def get_sat_unsat(output: str):
    if output.startswith("% SATISFIABLE"):
        return "sat"
    elif output.startswith("% UNSATISFIABLE"):
        return "unsat"
    return "unknown"


def get_variables_from_formula(formula: str) -> set:
    operators = {"->", "<-", "<->", "|", "&", "!"}
    tokens = re.split(r"\s+|(\W)", formula)
    variables = [
        token
        for token in tokens
        if token and token not in operators and not re.match(r"\W", token)
    ]
    return set(variables)


def prettify_result(f1: str, f2: str, result: str) -> str:
    if result.startswith("% SATISFIABLE"):
        variables_f1 = get_variables_from_formula(f1)
        variables_f2 = get_variables_from_formula(f2)
        common_vars = variables_f1.intersection(variables_f2)
        previous_vars = variables_f1 - common_vars
        current_vars = variables_f2 - common_vars
        lines = result.strip().splitlines()
        assignments = []
        for line in lines:
            line = line.strip()
            if line and not line.startswith("%"):
                var, val = line.split("=")
                var = var.strip()
                val = val.strip()
                if var in common_vars:
                    assignments.append(f"{var} = {val}")
                elif var in previous_vars:
                    assignments.append(
                        f"<span style='color: red;'>{var} = {val}</span>"
                    )
                elif var in current_vars:
                    assignments.append(
                        f"<span style='color: green;'>{var} = {val}</span>"
                    )
            else:
                assignments.append(line)
        return "\n".join(assignments)


def pretty_error(message: str) -> str:
    return f"<span style='color: red'>Error: {message}</span>"


def sanitize_formula(formula: str) -> str:
    lines = formula.splitlines()
    sanitized_lines = [line.split("%")[0] for line in lines if line.strip()]
    sanitize_formula = " ".join(sanitized_lines)
    sanitize_formula = re.sub(r"\s+", " ", sanitize_formula).strip()
    return sanitize_formula


def diff_witness(f1: str, f2: str, filter: str = "", analysis: str = ""):
    f1_not_f2 = f"({f1}) & (!({f2}))"
    if filter:
        all_vars = get_variables_from_formula(f1_not_f2)
        filtered_vars = get_variables_from_formula(filter)
        if not filtered_vars.issubset(all_vars):
            return f1_not_f2, pretty_error(
                "Filter contains variables not present in either previous or current formula."
            )
        f1_not_f2 = f"({f1_not_f2}) & ({filter})"
    res = process_commands(f1_not_f2)
    if analysis == "not-current-but-previous":
        res = prettify_result(f1, f2, res)
    elif analysis == "not-previous-but-current":
        res = prettify_result(f2, f1, res)
    return f1_not_f2, res


def common_witness(f1: str, f2: str, filter: str = ""):
    conjuncted = f"({f1}) & ({f2})"
    if filter:
        all_vars = get_variables_from_formula(conjuncted)
        filtered_vars = get_variables_from_formula(filter)
        if not filtered_vars.issubset(all_vars):
            return conjuncted, pretty_error(
                "Filter contains variables not present in either previous or current formula."
            )
        conjuncted = f"({conjuncted}) & ({filter})"
    res = process_commands(conjuncted)
    res = prettify_result(f1, f2, res)
    return conjuncted, res


def semantic_relation(f1: str, f2: str):
    """Determine the semantic relation between two formulas f1 and f2.
    f1: current formula
    f2: previous formula
    """
    f1 = sanitize_formula(f1)
    f2 = sanitize_formula(f2)
    f1_not_f2 = process_commands(f"({f1}) & (!({f2}))")
    not_f1_but_f2 = process_commands(f"(!({f1})) & ({f2})")
    res_f1_not_f2 = get_sat_unsat(f1_not_f2)
    res_not_f1_but_f2 = get_sat_unsat(not_f1_but_f2)

    if res_f1_not_f2 == "unknown" or res_not_f1_but_f2 == "unknown":
        return "Error in the formula"

    if res_f1_not_f2 == "unsat" and res_not_f1_but_f2 == "unsat":
        return "Current ≡ Previous\nAll valuations that satisfy the current formula also satisfy the previous formula, and vice versa."
    elif res_f1_not_f2 == "sat" and res_not_f1_but_f2 == "unsat":
        return "Previous ⊨ Current\nAll valuations that satisfy the previous formula also satisfy the current formula. Some valuations that satisfy the current formula do not satisfy the previous formula."
    elif res_f1_not_f2 == "unsat" and res_not_f1_but_f2 == "sat":
        return "Current ⊨ Previous\nAll valuations that satisfy the current formula also satisfy the previous formula. Some valuations that satisfy the previous formula do not satisfy the current formula."
    elif res_f1_not_f2 == "sat" and res_not_f1_but_f2 == "sat":
        return "The formulas are incomparable\nThere exist valuations that satisfy the current formula but not the previous formula, and vice versa."
    else:
        return None


_ASSIGNMENT_LINE = re.compile(r"^\s*(\S+)\s*=\s*([01])\s*$")
_HTML_TAG = re.compile(r"<[^>]+>")


def parse_assignment(witness: str | None) -> dict[str, bool] | None:
    """Return the assignment printed in a (possibly prettified) Limboole witness, or None."""

    if not witness or "SATISFIABLE" not in witness or "UNSATISFIABLE" in witness:
        return None
    assignment: dict[str, bool] = {}
    for line in witness.splitlines():
        match = _ASSIGNMENT_LINE.match(_HTML_TAG.sub("", line))
        if match:
            assignment[match.group(1)] = match.group(2) == "1"
    return assignment or None


def get_formula_from_valuation(valuation: str) -> str:
    lines = valuation.strip().splitlines()
    assignments = []
    for line in lines:
        # A prettified witness wraps the variables of only one formula in <span> tags.
        line = _HTML_TAG.sub("", line).strip()
        if line and not line.startswith("%"):
            if line.endswith("= 1"):
                assignments.append(line.replace("= 1", "").strip())
            elif line.endswith("= 0"):
                assignments.append(f"!{line.replace('= 0', '').strip()}")
    formula = " & ".join(assignments)
    formula = f"({formula})"
    return formula


def store_witness(f1: str, f2: str, analysis: str, filter: str = ""):
    """
    f1: previous formula
    f2: current formula
    """
    f1 = sanitize_formula(f1)
    f2 = sanitize_formula(f2)
    filter = sanitize_formula(filter) if filter else ""
    if analysis == "not-previous-but-current":
        formula, res = diff_witness(f2, f1, filter, analysis=analysis)
    elif analysis == "not-current-but-previous":
        formula, res = diff_witness(f1, f2, filter, analysis=analysis)
    elif analysis == "common-witness":
        formula, res = common_witness(f1, f2, filter)

    if res:
        valuation_formula = get_formula_from_valuation(res)
        store_formula = f"({formula}) & (!{valuation_formula})"
        specId = cache_manager.create_cache(
            store_formula, previous=f1, current=f2, ttl_seconds=3600
        )
        if specId:
            return specId, res
    return None, None


def get_next_witness(specId: str):
    witness = cache_manager.get_value(specId)
    previous = cache_manager.get_previous(specId)
    current = cache_manager.get_current(specId)
    res = process_commands(witness)
    if res.startswith("% UNSATISFIABLE"):
        return None
    valuation = get_formula_from_valuation(res)
    if witness:
        new_witness = witness.rstrip(")") + f") & !{valuation})"
        cache_manager.update_cache(specId, new_witness)
        return prettify_result(previous, current, res)
    return None


def evaluate_formula(specId: str, formula: str) -> Any:
    formula = sanitize_formula(formula)
    cache_info = cache_manager.get_cache_info(specId)
    if cache_info is None:
        return None
    stored_formula = cache_manager.get_value(specId)
    if stored_formula is None:
        return None
    conjuncted_formula = re.sub(r"\(", f"({formula} & ", stored_formula, count=1)
    return process_commands(conjuncted_formula)


def get_cache_info(specId: str):
    return cache_manager.get_cache_info(specId)


def delete_cache(specId: str) -> bool:
    return cache_manager.delete_cache(specId)
