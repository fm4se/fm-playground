"""Enumerate witness models of one matched query pair.

The ``smt_diff`` library reports one witness per direction.  For browsing,
the API enumerates further models of the same region:

* ``tightening``: models of the previous query (A) rejected by the current one (B);
* ``relaxation``: models of B rejected by A;
* ``common``: models accepted by both.

Successive models differ in the value of at least one constant shared by both
queries (all constants when none is shared), and an optional SMT-LIB filter
restricts the region further.
"""

from dataclasses import dataclass, field
from typing import Iterator

from smt_diff import ScriptError, SemanticDiffTool
from smt_diff.semantic_explainer import new_solver
from smt_diff.smt_parser import Query
from smt_diff.z3_bridge import EncodedQuery, PairPlan, encode_pair, plan_pair
from z3 import (
    Z3_DATATYPE_SORT,
    Z3_OP_UNINTERPRETED,
    Z3_UNINTERPRETED_SORT,
    And,
    BoolRef,
    Context,
    ExprRef,
    FuncDeclRef,
    ModelRef,
    Not,
    SortRef,
    Z3Exception,
    is_app,
    parse_smt2_string,
    sat,
    unsat,
)

MODES: tuple[str, ...] = ("tightening", "relaxation", "common")


class FilterError(ValueError):
    """The filter expression could not be parsed over the scripts' symbols."""


class InvalidPair(ValueError):
    """The requested query pair does not exist."""


def z3_message(error: Z3Exception) -> str:
    message = error.args[0] if error.args else str(error)
    return message.decode() if isinstance(message, bytes) else str(message)


@dataclass
class Symbols:
    """Uninterpreted symbols and user-defined sorts occurring in a formula."""

    constants: dict[str, ExprRef] = field(default_factory=dict)
    functions: dict[str, FuncDeclRef] = field(default_factory=dict)
    sorts: dict[str, SortRef] = field(default_factory=dict)

    @property
    def names(self) -> set[str]:
        return set(self.constants) | set(self.functions)

    def merged(self, other: "Symbols") -> "Symbols":
        return Symbols(
            {**self.constants, **other.constants},
            {**self.functions, **other.functions},
            {**self.sorts, **other.sorts},
        )


def collect_symbols(formula: ExprRef) -> Symbols:
    symbols = Symbols()
    seen: set[int] = set()

    def add_sort(sort: SortRef) -> None:
        if sort.kind() in (Z3_UNINTERPRETED_SORT, Z3_DATATYPE_SORT):
            symbols.sorts[sort.name()] = sort

    stack: list[ExprRef] = [formula]
    while stack:
        node = stack.pop()
        if node.get_id() in seen:
            continue
        seen.add(node.get_id())
        if is_app(node) and node.decl().kind() == Z3_OP_UNINTERPRETED:
            decl = node.decl()
            if decl.arity() == 0:
                symbols.constants[decl.name()] = node
            else:
                symbols.functions[decl.name()] = decl
                for index in range(decl.arity()):
                    add_sort(decl.domain(index))
            add_sort(decl.range())
        stack.extend(node.children())
    return symbols


@dataclass(frozen=True)
class EncodedPair:
    """One query pair translated into its own Z3 context."""

    tool: SemanticDiffTool
    plan: PairPlan
    ctx: Context
    a: EncodedQuery
    b: EncodedQuery


def encode_selected_pair(previous: str, current: str, pair: int | None, matching: str = "align") -> EncodedPair:
    """Parse both scripts and encode one query pair.

    ``pair`` indexes the matched pairs of ``DiffResult.pairs`` (same matching
    strategy); ``None`` pairs the last query of each script.
    Raises ``ScriptError`` or :class:`InvalidPair`.
    """

    tool = SemanticDiffTool(previous, current, matching=matching, explain=False)
    if pair is None:
        if not tool.script_a.queries or not tool.script_b.queries:
            raise InvalidPair("both scripts must pose at least one query")
        reserved = tool.script_a.symbol_names | tool.script_b.symbol_names
        plan = plan_pair(tool.script_a.queries[-1], tool.script_b.queries[-1], reserved)
    else:
        plans = [tool.plans[position] for position in sorted(tool.plans)]
        if not 0 <= pair < len(plans):
            raise InvalidPair(f"pair {pair} does not exist; the scripts have {len(plans)} matched query pair(s)")
        plan = plans[pair]
    ctx = Context()
    try:
        encoded_a, encoded_b = encode_pair(plan, ctx)
    except Z3Exception as error:
        raise ScriptError(f"Z3 rejected the scripts: {z3_message(error)}") from error
    return EncodedPair(tool, plan, ctx, encoded_a, encoded_b)


class WitnessStream:
    """Lazily enumerate the models of one region, one solver call per step."""

    def __init__(
        self,
        pair: EncodedPair,
        mode: str,
        pair_index: int | None,
        filter: str = "",
        solver_timeout_ms: int | None = None,
    ) -> None:
        if mode not in MODES:
            raise ValueError(f"unknown mode '{mode}' (expected one of {', '.join(MODES)})")
        self.mode = mode
        self.pair = pair
        self.pair_index = pair_index
        self.query_a: Query = pair.plan.query_a
        self.query_b: Query = pair.plan.query_b
        self.logic_a: str | None = pair.tool.script_a.logic
        self.logic_b: str | None = pair.tool.script_b.logic
        self.symbols_a = collect_symbols(pair.a.formula)
        self.symbols_b = collect_symbols(pair.b.formula)
        region: BoolRef = {
            "tightening": lambda: And(pair.a.formula, Not(pair.b.formula)),
            "relaxation": lambda: And(pair.b.formula, Not(pair.a.formula)),
            "common": lambda: And(pair.a.formula, pair.b.formula),
        }[mode]()
        self.solver = new_solver(pair.ctx, solver_timeout_ms)
        self.solver.add(region)
        if filter.strip():
            symbols = self.symbols_a.merged(self.symbols_b)
            decls = {**symbols.constants, **symbols.functions}
            try:
                self.solver.add(*parse_smt2_string(filter, sorts=symbols.sorts, decls=decls, ctx=pair.ctx))
            except Z3Exception as error:
                raise FilterError(z3_message(error)) from error
        shared = sorted(set(self.symbols_a.constants) & set(self.symbols_b.constants))
        names = shared or sorted(set(self.symbols_a.constants) | set(self.symbols_b.constants))
        constants = self.symbols_a.merged(self.symbols_b).constants
        self.terms: list[ExprRef] = [constants[name] for name in names]
        self.count = 0
        self.incomplete = False
        self.reason_unknown = ""
        self._models: Iterator[ModelRef] = self._enumerate(self.terms)

    @property
    def previous_only(self) -> set[str]:
        return self.symbols_a.names - self.symbols_b.names

    @property
    def current_only(self) -> set[str]:
        return self.symbols_b.names - self.symbols_a.names

    @property
    def status(self) -> str:
        """``sat`` once a model was found, else ``unsat`` or ``unknown``."""

        if self.count:
            return "sat"
        return "unknown" if self.incomplete else "unsat"

    def next(self) -> ModelRef | None:
        """Return the next model, or None when the enumeration has ended."""

        model = next(self._models, None)
        if model is not None:
            self.count += 1
        return model

    def _enumerate(self, terms: list[ExprRef]) -> Iterator[ModelRef]:
        # All-SMT by splitting on the terms (Bjorner et al., "Programming Z3").
        result = self.solver.check()
        if result != sat:
            if result != unsat:
                self.incomplete = True
                self.reason_unknown = self.solver.reason_unknown()
            return
        model = self.solver.model()
        yield model
        for index, term in enumerate(terms):
            self.solver.push()
            self.solver.add(term != model.eval(term, model_completion=True))
            for fixed in terms[:index]:
                self.solver.add(fixed == model.eval(fixed, model_completion=True))
            yield from self._enumerate(terms[index:])
            self.solver.pop()


def open_stream(
    previous: str,
    current: str,
    mode: str,
    *,
    pair: int | None = None,
    matching: str = "align",
    filter: str = "",
    solver_timeout_ms: int | None = None,
) -> WitnessStream:
    """Prepare the witness enumeration of one pair; no solver call is made yet."""

    encoded = encode_selected_pair(previous, current, pair, matching)
    return WitnessStream(encoded, mode, pair, filter, solver_timeout_ms)
