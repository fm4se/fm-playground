"""Select the logic of a comparison: the least upper bound of the two declared logics.

SMT-LIB names a logic by its parts (https://smt-lib.org/logics.shtml):
``QF_`` for quantifier-free formulas, ``A``/``AX`` for arrays, ``UF`` for
free sort and function symbols, ``BV`` for bit-vectors, ``FP`` for
floating-point, ``DT`` for datatypes, ``S`` for strings, and the arithmetic
part ``IDL``/``RDL`` (difference logic) or ``L``/``N`` (linear/non-linear)
with ``IA``/``RA``/``IRA`` (integers, reals, both).  ``ALL`` contains every
logic.

A logic contains another if it allows quantifiers whenever the other does, has
all its theories, and has an arithmetic part at least as strong.  The least
upper bound of two logics is the smallest logic that contains both; a script
of either version is also a script of this logic.  When a version sets no
logic, or a name does not follow this scheme (e.g. Z3's ``QF_FD`` or
``HORN``), there is no least upper bound and SmtDiff uses Z3's default solver.

A script may use symbols outside its declared logic.  Z3's solver for a logic
can then answer wrongly: in Z3 5.3.3, ``SolverFor("QF_UF")`` treats ``Int`` as
an uninterpreted sort in incremental checks and returns sat for the
unsatisfiable ``x > 5 /\\ not (x > 0)``.  SmtDiff therefore uses the least
upper bound only for formulas that it covers (:func:`outside`), and Z3's
default solver otherwise.
"""

from dataclasses import dataclass
from typing import Iterable, cast

from z3 import (
    ArraySortRef,
    Context,
    DatatypeSortRef,
    ExprRef,
    FuncDeclRef,
    SeqSortRef,
    SolverFor,
    SortRef,
    Z3_ARRAY_SORT,
    Z3_BOOL_SORT,
    Z3_BV_SORT,
    Z3_CHAR_SORT,
    Z3_DATATYPE_SORT,
    Z3_FLOATING_POINT_SORT,
    Z3_INT_SORT,
    Z3_OP_AS_ARRAY,
    Z3_OP_DIV,
    Z3_OP_IDIV,
    Z3_OP_MOD,
    Z3_OP_MUL,
    Z3_OP_POWER,
    Z3_OP_REM,
    Z3_OP_SPECIAL_RELATION_LO,
    Z3_OP_SPECIAL_RELATION_PLO,
    Z3_OP_SPECIAL_RELATION_PO,
    Z3_OP_SPECIAL_RELATION_TC,
    Z3_OP_SPECIAL_RELATION_TO,
    Z3_OP_UNINTERPRETED,
    Z3_REAL_SORT,
    Z3_RE_SORT,
    Z3_ROUNDING_MODE_SORT,
    Z3_SEQ_SORT,
    Z3_UNINTERPRETED_SORT,
    Z3Exception,
    Z3_get_array_arity,
    is_app,
    is_int_value,
    is_quantifier,
    is_rational_value,
    is_var,
)

ALL: str = "ALL"
QUANTIFIER_FREE: str = "QF_"
# Theory parts in the order in which they appear in SMT-LIB logic names.
THEORIES: tuple[str, ...] = ("A", "UF", "BV", "FP", "DT", "S")
# Arithmetic parts: (strength, sorts); 0 = difference logic, 1 = linear, 2 = non-linear.
ARITHMETIC: dict[str, tuple[int, frozenset[str]]] = {
    "IDL": (0, frozenset({"Int"})),
    "RDL": (0, frozenset({"Real"})),
    "LIA": (1, frozenset({"Int"})),
    "LRA": (1, frozenset({"Real"})),
    "LIRA": (1, frozenset({"Int", "Real"})),
    "NIA": (2, frozenset({"Int"})),
    "NRA": (2, frozenset({"Real"})),
    "NIRA": (2, frozenset({"Int", "Real"})),
}
# The theory part that a Z3 sort kind needs (Int, Real and Bool are handled separately).
SORT_THEORIES: dict[int, str] = {
    Z3_UNINTERPRETED_SORT: "UF",
    Z3_ARRAY_SORT: "A",
    Z3_BV_SORT: "BV",
    Z3_FLOATING_POINT_SORT: "FP",
    Z3_ROUNDING_MODE_SORT: "FP",
    Z3_DATATYPE_SORT: "DT",
    Z3_SEQ_SORT: "S",
    Z3_RE_SORT: "S",
    Z3_CHAR_SORT: "S",
}


@dataclass(frozen=True)
class LogicParts:
    """Store the parts of one SMT-LIB logic name."""

    quantifier_free: bool
    theories: frozenset[str]
    arithmetic: tuple[int, frozenset[str]] | None


@dataclass(frozen=True)
class LogicChoice:
    """Store the logic used for the checks and the diagnostic that explains it."""

    logic: str | None
    diagnostic: str | None


def parse_logic(name: str) -> LogicParts | None:
    """Split a logic name into its parts, or return None if it does not follow the SMT-LIB scheme."""

    quantifier_free: bool = name.startswith(QUANTIFIER_FREE)
    rest: str = name[len(QUANTIFIER_FREE):] if quantifier_free else name
    if rest == "AX":
        return LogicParts(quantifier_free, frozenset({"A"}), None)
    theories: set[str] = set()
    theory: str
    for theory in THEORIES:
        if rest.startswith(theory):
            theories.add(theory)
            rest = rest[len(theory):]
    if rest and rest not in ARITHMETIC:
        return None
    arithmetic: tuple[int, frozenset[str]] | None = ARITHMETIC[rest] if rest else None
    if not theories and arithmetic is None:
        return None
    return LogicParts(quantifier_free, frozenset(theories), arithmetic)


def _arithmetic_name(arithmetic: tuple[int, frozenset[str]]) -> str:
    """Return the name of an arithmetic part."""

    name: str
    for name, value in ARITHMETIC.items():
        if value == arithmetic:
            return name
    raise ValueError(f"no arithmetic part has strength {arithmetic[0]} over {sorted(arithmetic[1])}")


def logic_name(parts: LogicParts) -> str:
    """Return the SMT-LIB name of a logic given by its parts."""

    prefix: str = QUANTIFIER_FREE if parts.quantifier_free else ""
    if parts.theories == {"A"} and parts.arithmetic is None:
        return prefix + "AX"
    theories: str = "".join(theory for theory in THEORIES if theory in parts.theories)
    arithmetic: str = _arithmetic_name(parts.arithmetic) if parts.arithmetic is not None else ""
    return prefix + theories + arithmetic


def _join_arithmetic(
    left: tuple[int, frozenset[str]] | None, right: tuple[int, frozenset[str]] | None,
) -> tuple[int, frozenset[str]] | None:
    """Return the weakest arithmetic part that contains both parts."""

    if left is None or right is None:
        return left if right is None else right
    strength: int = max(left[0], right[0])
    sorts: frozenset[str] = left[1] | right[1]
    # Difference logic has no mixed Int/Real variant; the next stronger part is LIRA.
    if strength == 0 and len(sorts) == 2:
        strength = 1
    return strength, sorts


def least_upper_bound(logic_a: str, logic_b: str) -> str | None:
    """Return the smallest logic that contains both logics, or None if a name is not known."""

    if logic_a == logic_b:
        return logic_a
    if ALL in (logic_a, logic_b):
        return ALL
    parts_a: LogicParts | None = parse_logic(logic_a)
    parts_b: LogicParts | None = parse_logic(logic_b)
    if parts_a is None or parts_b is None:
        return None
    return logic_name(LogicParts(
        parts_a.quantifier_free and parts_b.quantifier_free,
        parts_a.theories | parts_b.theories,
        _join_arithmetic(parts_a.arithmetic, parts_b.arithmetic),
    ))


def _sort_parts(sort: SortRef, theories: set[str], sorts: set[str], seen: set[str] | None = None) -> bool:
    """Add the parts that a sort needs; return False for a sort SmtDiff cannot classify.

    Array sorts also need their index and element sorts, and datatype sorts
    the sorts of their fields, even if no term of these sorts occurs.
    """

    seen = set() if seen is None else seen
    if sort.sexpr() in seen:
        return True
    seen.add(sort.sexpr())
    kind: int = sort.kind()
    if kind == Z3_BOOL_SORT:
        return True
    if kind in (Z3_INT_SORT, Z3_REAL_SORT):
        sorts.add("Int" if kind == Z3_INT_SORT else "Real")
        return True
    if kind == Z3_SEQ_SORT and not cast(SeqSortRef, sort).is_string():
        return False
    part: str | None = SORT_THEORIES.get(kind)
    if part is None:
        return False
    theories.add(part)
    if kind == Z3_ARRAY_SORT:
        array: ArraySortRef = cast(ArraySortRef, sort)
        domains: list[SortRef] = [array.domain_n(index) for index in range(Z3_get_array_arity(array.ctx_ref(), array.ast))]
        return all(_sort_parts(domain, theories, sorts, seen) for domain in domains) and _sort_parts(array.range(), theories, sorts, seen)
    if kind == Z3_DATATYPE_SORT:
        datatype: DatatypeSortRef = cast(DatatypeSortRef, sort)
        constructor: FuncDeclRef
        for constructor in (datatype.constructor(index) for index in range(datatype.num_constructors())):
            if not all(_sort_parts(constructor.domain(index), theories, sorts, seen) for index in range(constructor.arity())):
                return False
    return True


def _nonlinear(term: ExprRef) -> bool:
    """Return True for a product, quotient, remainder, or power of two non-constant terms."""

    kind: int = term.decl().kind()
    if kind == Z3_OP_MUL:
        return sum(1 for child in term.children() if not is_rational_value(child) and not is_int_value(child)) > 1
    if kind in (Z3_OP_DIV, Z3_OP_IDIV, Z3_OP_MOD, Z3_OP_REM):
        divisor: ExprRef = term.children()[1]
        return not is_rational_value(divisor) and not is_int_value(divisor)
    return kind == Z3_OP_POWER


def used_logic(formulas: Iterable[ExprRef]) -> tuple[LogicParts | None, str]:
    """Return the logic parts that ``formulas`` use, or None and the reason if a term cannot be classified.

    The arithmetic part is never difference logic: SmtDiff does not check
    whether arithmetic atoms are differences, so IDL and RDL do not cover
    arithmetic formulas.
    """

    quantifier_free: bool = True
    theories: set[str] = set()
    sorts: set[str] = set()
    strength: int = 1
    seen: set[int] = set()
    sort_ids: set[int] = set()
    sort_names: set[str] = set()
    stack: list[ExprRef] = list(formulas)
    while stack:
        term: ExprRef = stack.pop()
        if term.get_id() in seen:
            continue
        seen.add(term.get_id())
        if is_quantifier(term):
            if term.is_lambda():
                return None, "a lambda term"
            quantifier_free = False
            index: int
            for index in range(term.num_vars()):
                if not _sort_parts(term.var_sort(index), theories, sorts, sort_names):
                    return None, f"the sort {term.var_sort(index)}"
            stack.append(term.body())
            continue
        sort: SortRef = term.sort()
        if sort.get_id() not in sort_ids:
            sort_ids.add(sort.get_id())
            if not _sort_parts(sort, theories, sorts, sort_names):
                return None, f"the sort {sort}"
        if is_var(term) or not is_app(term):
            continue
        declaration: FuncDeclRef = term.decl()
        if declaration.kind() == Z3_OP_UNINTERPRETED and declaration.arity() > 0:
            theories.add("UF")
        elif declaration.kind() in (Z3_OP_AS_ARRAY, Z3_OP_SPECIAL_RELATION_LO, Z3_OP_SPECIAL_RELATION_PO,
                                    Z3_OP_SPECIAL_RELATION_PLO, Z3_OP_SPECIAL_RELATION_TO, Z3_OP_SPECIAL_RELATION_TC):
            return None, f"the operator {declaration.name()}"
        if _nonlinear(term):
            strength = 2
        stack.extend(term.children())
    arithmetic: tuple[int, frozenset[str]] | None = (strength, frozenset(sorts)) if sorts else None
    return LogicParts(quantifier_free, frozenset(theories), arithmetic), ""


def outside(logic: str, formulas: Iterable[ExprRef]) -> str | None:
    """Return None if ``logic`` covers ``formulas``, else what the formulas use outside the logic."""

    if logic == ALL:
        return None
    bound: LogicParts | None = parse_logic(logic)
    if bound is None:
        return "symbols that SmtDiff cannot check against this logic"
    used, reason = used_logic(formulas)
    if used is None:
        return reason
    missing: list[str] = []
    if bound.quantifier_free and not used.quantifier_free:
        missing.append("quantifiers")
    missing += [theory for theory in THEORIES if theory in used.theories - bound.theories]
    if used.arithmetic is not None:
        covered: bool = bound.arithmetic is not None and bound.arithmetic[0] >= used.arithmetic[0] and used.arithmetic[1] <= bound.arithmetic[1]
        if not covered:
            missing.append(_arithmetic_name(used.arithmetic))
    return ", ".join(missing) if missing else None


def z3_knows(logic: str) -> bool:
    """Return True if Z3 accepts ``logic`` as the logic of a solver."""

    try:
        SolverFor(logic, ctx=Context())
    except Z3Exception:
        return False
    return True


def choose_logic(logic_a: str | None, logic_b: str | None, use_logic: bool = True) -> LogicChoice:
    """Return the logic for the checks of a comparison and, if the logic changed, a diagnostic.

    With ``use_logic=False`` the checks always use Z3's default solver, but a
    changed logic is still reported.
    """

    if logic_a is None and logic_b is None:
        return LogicChoice(None, None)
    if logic_a is None or logic_b is None:
        side, logic = ("B", logic_b) if logic_a is None else ("A", logic_a)
        return LogicChoice(None, f"[Info] only version {side} sets a logic ({logic}); the checks use Z3's default solver")
    changed: str = f"the logic changed from {logic_a} to {logic_b}; " if logic_a != logic_b else ""
    if not use_logic:
        return LogicChoice(None, f"[Info] {changed}the checks use Z3's default solver" if changed else None)
    bound: str | None = least_upper_bound(logic_a, logic_b)
    if bound is None:
        return LogicChoice(None, f"[Info] {changed}no least upper bound is known; the checks use Z3's default solver")
    if bound != ALL and parse_logic(bound) is None:
        return LogicChoice(None, f"[Info] {changed}SmtDiff cannot check formulas against the logic {bound}; the checks use Z3's default solver")
    if not z3_knows(bound):
        return LogicChoice(None, f"[Info] {changed}Z3 does not accept the logic {bound}; the checks use Z3's default solver")
    if not changed:
        return LogicChoice(bound, None)
    return LogicChoice(bound, f"[Info] {changed}the checks use the least upper bound {bound}")


__all__ = [
    "ALL",
    "LogicChoice",
    "LogicParts",
    "choose_logic",
    "least_upper_bound",
    "logic_name",
    "outside",
    "parse_logic",
    "used_logic",
    "z3_knows",
]
