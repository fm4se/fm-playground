"""Analyze semantic differences between two SMT-LIB scripts, query by query.

A script denotes a *sequence* of satisfiability queries, one per
``check-sat``/``check-sat-assuming`` (see :mod:`smt_parser`).  Two scripts are
compared by matching their queries (:mod:`query_matching`) and comparing each
matched pair ``(QA, QB)`` exactly, in both directions:

* tightening  = models of QA rejected by QB, i.e. ``QA /\\ not QB`` is sat;
* relaxation  = models of QB rejected by QA, i.e. ``QB /\\ not QA`` is sat.

Two engines decide these questions:

``direct``
    every pair is parsed into a fresh Z3 context and every check uses a fresh
    solver.  This is the reference engine: it isolates Z3's global state and
    lets Z3 pick its strongest non-incremental tactics.

``selectors``
    all pairs share one context and one incremental solver per direction.
    Each conjunct ``c`` of the positive side is added once as ``s_c => c`` for
    a fresh selector ``s_c``; a query is decided by checking under the
    assumptions ``{s_c | c active}``.  The negated side is always added as a
    concrete formula guarded by a fresh literal: guarding it by selectors
    would be unsound, because inactive selectors are free and the negation of
    ``s => c`` is satisfied by ``s = true, c = false``.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence, cast

from z3 import (
    And,
    BoolRef,
    Context,
    ExprRef,
    FreshBool,
    FuncDeclRef,
    Implies,
    ModelRef,
    Not,
    Or,
    Solver,
    eq,
    is_false,
    is_true,
    sat,
    simplify,
    unsat,
    Z3_UNINTERPRETED_SORT,
)

from .logics import LogicChoice, choose_logic, outside
from .query_matching import QueryMatch, match_queries
from .semantic_explainer import (
    AbductionResult, CounterfactualResult, SemanticExplainer, budget_exhausted, checked, decide, new_solver, status_name,
    time_budget,
)
from .sexpr import SMTLibSyntaxError
from .smt_parser import Query, Script, ScriptError, SMTParser
from .z3_bridge import (
    SORT_CATEGORIES,
    AssertionEntry,
    CollisionDiagnostic,
    EncodedQuery,
    PairPlan,
    encode_pair,
    encode_query,
    plan_pair,
)

ENCODINGS: tuple[str, ...] = ("direct", "selectors")
# ``queries``: one query per check command (the reference semantics);
# ``one-set``: one query per script, the final assertion stack (an ablation).
SEMANTICS: tuple[str, ...] = ("queries", "one-set")
DEFAULT_TIMEOUT_MS: int = 10_000
DEFAULT_MAX_GENERALIZATIONS: int = 64


class Relation(str, Enum):
    """Relation between the model sets of a matched query pair."""

    EQUIVALENT = "equivalent"
    TIGHTENED = "tightened"
    RELAXED = "relaxed"
    INCOMPARABLE = "incomparable"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class DirectionResult:
    """Store the analysis of one direction between two queries.

    ``status`` is the Z3 answer for ``base /\\ not compare``.  ``diverged`` is
    True exactly when that answer is ``sat``; ``model`` is then the witness and
    ``model_validated`` states whether Z3's model evaluator confirmed it.
    ``generalizations`` are conjunctions ``E_i`` of predicate literals with
    ``base /\\ E_i |= not compare`` (abduction relative to the base query);
    when ``coverage_complete`` is True, ``base /\\ not compare`` is equivalent
    to ``base /\\ (E_1 \\/ ... \\/ E_n)``.
    """

    base_name: str
    compare_name: str
    diverged: bool
    model: ModelRef | None
    violated_assertions: tuple[AssertionEntry, ...]
    explanation: ExprRef | None
    counterfactual: ModelRef | None
    changes: tuple[str, ...]
    generalizations: tuple[ExprRef, ...] = ()
    coverage_formula: ExprRef | None = None
    coverage_complete: bool = True
    uncovered_model: ModelRef | None = None
    solver_unknown: bool = False
    coverage_unknown: bool = False
    status: str = "unsat"
    model_validated: bool = False
    undetermined_assertions: tuple[AssertionEntry, ...] = ()
    generalization_limit_reached: bool = False
    generalizations_minimal: bool = True
    counterfactual_status: str | None = None
    counterfactual_target: str | None = None
    counterfactual_validated: bool = False
    counterfactual_optimized: bool = False
    counterfactual_note: str = ""
    reason_unknown: str = ""
    generalization_literals: tuple[tuple[BoolRef, ...], ...] = ()
    change_details: tuple["ValueChange", ...] = ()
    time_budget_reached: bool = False


@dataclass(frozen=True)
class ValueChange:
    """A symbol whose value differs between a witness and its counterfactual."""

    symbol: str
    before: str
    after: str

    def __str__(self) -> str:
        return f"{self.symbol}: {self.before} -> {self.after}"


@dataclass(frozen=True)
class Explanation:
    """Abductive generalizations and the nearest counterfactual of one witness.

    The witness lies in the region ``base /\\ not compare``.  Each
    generalization ``E_i`` satisfies ``base /\\ E_i |= not compare``; when
    ``coverage_complete`` is True the generalizations cover the whole region.
    ``changes`` compare the witness with ``counterfactual.model``.
    """

    generalizations: tuple[BoolRef, ...]
    generalization_literals: tuple[tuple[BoolRef, ...], ...]
    coverage_complete: bool
    coverage_unknown: bool
    uncovered_model: ModelRef | None
    limit_reached: bool
    minimal: bool
    counterfactual: CounterfactualResult
    changes: tuple[ValueChange, ...]


@dataclass(frozen=True)
class QueryPairResult:
    """Store the comparison of one matched query pair."""

    query_a: Query
    query_b: Query
    formula_a: BoolRef
    formula_b: BoolRef
    status_a: str
    status_b: str
    tightening: DirectionResult
    relaxation: DirectionResult
    collisions: tuple[CollisionDiagnostic, ...]
    private_symbols_a: tuple[str, ...] = ()
    private_symbols_b: tuple[str, ...] = ()
    encoded_a: EncodedQuery | None = field(default=None, repr=False)
    encoded_b: EncodedQuery | None = field(default=None, repr=False)

    @property
    def signature_changed(self) -> bool:
        """Return True when a symbol of both versions is compared as two different symbols.

        The relation is then computed over the union of both signatures: the
        renamed symbols are unconstrained in the other version.
        """

        return any(collision.changes_vocabulary for collision in self.collisions)

    @property
    def relation(self) -> Relation:
        """Classify the pair from the two directional answers."""

        statuses: tuple[str, str] = (self.tightening.status, self.relaxation.status)
        if "unknown" in statuses:
            return Relation.UNKNOWN
        return {
            ("unsat", "unsat"): Relation.EQUIVALENT,
            ("sat", "unsat"): Relation.TIGHTENED,
            ("unsat", "sat"): Relation.RELAXED,
            ("sat", "sat"): Relation.INCOMPARABLE,
        }[statuses]


@dataclass(frozen=True)
class UnmatchedQuery:
    """A query of one script without a counterpart in the other script."""

    side: str
    query: Query
    status: str


@dataclass(frozen=True)
class DiffResult:
    """Store all pairwise analyses together with collected diagnostics."""

    pairs: tuple[QueryPairResult, ...]
    unmatched_a: tuple[UnmatchedQuery, ...]
    unmatched_b: tuple[UnmatchedQuery, ...]
    parser_diagnostics: tuple[str, ...]
    matching: str
    encoding: str
    semantics: str = "queries"
    translate: bool = True
    time_budget_reached: bool = False
    # The least upper bound of the two logics (None: all checks use Z3's default
    # solver), the number of checks that were undecided for this logic and
    # repeated with the default solver, and the number of query pairs and
    # unmatched queries whose formulas use symbols outside the logic (their
    # checks use the default solver).
    logic: str | None = None
    logic_fallbacks: int = 0
    logic_outside: int = 0

    @property
    def collisions(self) -> tuple[CollisionDiagnostic, ...]:
        """Return the signature collisions of all pairs."""

        return tuple(collision for pair in self.pairs for collision in pair.collisions)

    @property
    def equivalent(self) -> bool | None:
        """Return True/False when the query sequences are provably (in)equivalent, else None."""

        if self.unmatched_a or self.unmatched_b:
            return False
        relations: list[Relation] = [pair.relation for pair in self.pairs]
        if any(relation in (Relation.TIGHTENED, Relation.RELAXED, Relation.INCOMPARABLE) for relation in relations):
            return False
        if any(pair.tightening.diverged or pair.relaxation.diverged for pair in self.pairs):
            return False
        if all(relation is Relation.EQUIVALENT for relation in relations):
            return True
        return None

    def _single(self) -> QueryPairResult:
        """Return the only pair, for the common one-query case."""

        if len(self.pairs) != 1:
            raise ValueError(f"the scripts have {len(self.pairs)} matched query pairs; use DiffResult.pairs")
        return self.pairs[0]

    @property
    def tightening(self) -> DirectionResult:
        """Return the tightening direction of the only matched pair."""

        return self._single().tightening

    @property
    def relaxation(self) -> DirectionResult:
        """Return the relaxation direction of the only matched pair."""

        return self._single().relaxation


def _fresh_check(
    ctx: Context, timeout_ms: int | None, logic: str | None, positives: tuple[BoolRef, ...], negative: BoolRef | None,
) -> tuple[str, ModelRef | None, str]:
    """Check ``/\\ positives /\\ not negative`` with a fresh solver."""

    solver: Solver = new_solver(ctx, timeout_ms, logic)
    if positives:
        solver.add(*positives)
    if negative is not None:
        solver.add(Not(negative))
    result = solver.check()
    return status_name(result), solver.model() if result == sat else None, solver.reason_unknown() if result != sat and result != unsat else ""


class _DirectEngine:
    """Decide every check with a fresh solver.

    A check with a ``logic`` uses a solver for this logic; the caller passes a
    logic only if it covers the formulas (see :func:`logics.outside`).  A check
    that Z3 does not decide for the logic is repeated with Z3's default
    solver; ``fallbacks`` counts these checks.
    """

    def __init__(self, timeout_ms: int | None) -> None:
        self.timeout_ms: int | None = timeout_ms
        self.fallbacks: int = 0

    def check(
        self, side: str, ctx: Context, positives: tuple[BoolRef, ...], negative: BoolRef | None, logic: str | None = None,
    ) -> tuple[str, ModelRef | None, str]:
        """Check ``/\\ positives /\\ not negative``."""

        outcome: tuple[str, ModelRef | None, str] = _fresh_check(ctx, self.timeout_ms, logic, positives, negative)
        if logic is not None and outcome[0] == "unknown":
            self.fallbacks += 1
            outcome = _fresh_check(ctx, self.timeout_ms, None, positives, negative)
        return outcome


class _SelectorEngine:
    """Decide checks incrementally with one guarded solver per positive side.

    Checks with a ``logic`` use separate solvers for this logic, so that a
    solver for a logic only receives formulas that the logic covers.  An
    undecided check with a logic is repeated as in :class:`_DirectEngine`.
    """

    def __init__(self, ctx: Context, timeout_ms: int | None) -> None:
        self.ctx: Context = ctx
        self.solvers: dict[tuple[str, str | None], Solver] = {}
        self.guards: dict[tuple[str, str | None], dict[int, tuple[BoolRef, BoolRef]]] = {}
        self.timeout_ms: int | None = timeout_ms
        self.fallbacks: int = 0

    def check(
        self, side: str, ctx: Context, positives: tuple[BoolRef, ...], negative: BoolRef | None, logic: str | None = None,
    ) -> tuple[str, ModelRef | None, str]:
        """Check ``/\\ positives /\\ not negative`` under selector assumptions."""

        if (side, logic) not in self.solvers:
            self.solvers[(side, logic)] = new_solver(self.ctx, self.timeout_ms, logic)
            self.guards[(side, logic)] = {}
        solver: Solver = self.solvers[(side, logic)]
        guards: dict[int, tuple[BoolRef, BoolRef]] = self.guards[(side, logic)]
        assumptions: list[BoolRef] = []
        ast: BoolRef
        for ast in positives:
            cached: tuple[BoolRef, BoolRef] | None = guards.get(ast.get_id())
            if cached is not None and eq(cached[0], ast):
                guard: BoolRef = cached[1]
            else:
                guard = FreshBool("smtdiff_selector", ctx)
                solver.add(Implies(guard, ast))
                guards[ast.get_id()] = (ast, guard)
            assumptions.append(guard)
        if negative is not None:
            query_guard: BoolRef = FreshBool("smtdiff_query", ctx)
            solver.add(Implies(query_guard, Not(negative)))
            assumptions.append(query_guard)
        result = solver.check(*assumptions)
        if logic is not None and result != sat and result != unsat:
            self.fallbacks += 1
            return _fresh_check(ctx, self.timeout_ms, None, positives, negative)
        return status_name(result), solver.model() if result == sat else None, solver.reason_unknown() if result != sat and result != unsat else ""


def selector_hazards(scripts: tuple[Script, ...]) -> list[str]:
    """Return reasons why the scripts cannot share one Z3 context."""

    reasons: list[str] = []
    definitions: dict[str, set[str]] = {}
    script: Script
    for script in scripts:
        for query in script.queries:
            for declaration in query.declarations:
                if declaration.category in ("recursive", "other"):
                    reasons.append(f"'{declaration.names[0] if declaration.names else declaration.command.name}' is a {declaration.category} declaration")
                if declaration.category in SORT_CATEGORIES:
                    for name in declaration.sort_names:
                        definitions.setdefault(name, set()).add(declaration.identity)
    name: str
    for name, variants in sorted(definitions.items()):
        if len(variants) > 1:
            reasons.append(f"sort '{name}' has {len(variants)} different definitions")
    return sorted(set(reasons))


def _disjunction(formulas: list[BoolRef]) -> BoolRef:
    """Return the disjunction of a non-empty list of formulas."""

    return formulas[0] if len(formulas) == 1 else cast(BoolRef, Or(formulas))


def _interpretation_changes(before: ModelRef, after: ModelRef, functions: Sequence[FuncDeclRef]) -> list[ValueChange]:
    """Describe the function symbols whose interpretation differs between two models.

    Interpretations are compared as printed by Z3.  Over uninterpreted sorts
    the domain elements are model-local, so this reports that the function
    changed, not by how much.
    """

    changes: list[ValueChange] = []
    function: FuncDeclRef
    for function in functions:
        old, new = before.get_interp(function), after.get_interp(function)
        if old is None and new is None:
            continue
        old_text: str = str(old) if old is not None else "(unspecified)"
        new_text: str = str(new) if new is not None else "(unspecified)"
        if old_text != new_text:
            changes.append(ValueChange(function.name(), old_text, new_text))
    return changes


def _same_value(original: ExprRef, replacement: ExprRef) -> bool:
    """Return True when two model values are provably equal."""

    return eq(original, replacement) or is_true(simplify(original == replacement))


def classify_assertions(compare: EncodedQuery, model: ModelRef) -> tuple[tuple[AssertionEntry, ...], tuple[AssertionEntry, ...]]:
    """Return the conjuncts of ``compare`` that ``model`` falsifies, and those it leaves undetermined."""

    violated: list[AssertionEntry] = []
    undetermined: list[AssertionEntry] = []
    entry: AssertionEntry
    for entry in compare.entries:
        value: ExprRef = model.evaluate(entry.ast, model_completion=True)
        if is_false(value):
            violated.append(entry)
        elif not is_true(value):
            undetermined.append(entry)
    return tuple(violated), tuple(undetermined)


def explain_divergence(
    base_formula: BoolRef,
    compare_formula: BoolRef,
    model: ModelRef,
    *,
    predicates: list[BoolRef] | None = None,
    terms: list[ExprRef] | None = None,
    functions: Sequence[FuncDeclRef] | None = None,
    timeout_ms: int | None = DEFAULT_TIMEOUT_MS,
    max_generalizations: int = DEFAULT_MAX_GENERALIZATIONS,
) -> Explanation:
    """Explain a witness ``model`` of ``base /\\ not compare``.

    Abduction generalizes the witness to conjunctions of predicate literals,
    repeated on uncovered witnesses until the region is covered; the
    counterfactual is the nearest model accepted by ``compare``.  Predicates,
    terms and function symbols default to those of ``base /\\ compare``.
    """

    ctx: Context = base_formula.ctx
    combined: BoolRef = cast(BoolRef, And(base_formula, compare_formula))
    if predicates is None:
        predicates = SemanticExplainer.extract_atomic_predicates(combined)
    if terms is None:
        terms = SemanticExplainer.extract_optimizable_terms(combined)
    if functions is None:
        functions = SemanticExplainer.extract_function_symbols(combined)
    region: BoolRef = cast(BoolRef, And(base_formula, Not(compare_formula)))
    generalizations: list[BoolRef] = []
    literal_sets: list[tuple[BoolRef, ...]] = []
    complete: bool = False
    coverage_unknown: bool = False
    uncovered: ModelRef | None = None
    limit_reached: bool = False
    minimal: bool = True
    witness: ModelRef = model
    while True:
        abduction: AbductionResult = SemanticExplainer.abduce(
            compare_formula, witness, predicates, timeout_ms, background=base_formula,
        )
        if abduction.status != "explained" or abduction.explanation is None:
            coverage_unknown = abduction.status == "unknown"
            uncovered = None if coverage_unknown else witness
            break
        if decide(witness, abduction.explanation, timeout_ms) is not True:
            uncovered = witness
            break
        generalizations.append(abduction.explanation)
        literal_sets.append(abduction.literals)
        minimal = minimal and abduction.minimal
        coverage: Solver = new_solver(ctx, timeout_ms)
        coverage.add(region)
        generalization: BoolRef
        for generalization in generalizations:
            coverage.add(Not(generalization))
        outcome = checked(coverage, timeout_ms)
        if outcome == unsat:
            complete = True
            break
        if outcome != sat:
            coverage_unknown = True
            break
        # Only an uncovered witness proves that the budget was too small.
        if len(generalizations) >= max_generalizations:
            limit_reached = True
            uncovered = coverage.model()
            break
        witness = coverage.model()
    counterfactual: CounterfactualResult = SemanticExplainer.find_counterfactual(
        base_formula, compare_formula, model, terms, timeout_ms,
    )
    changes: list[ValueChange] = []
    if counterfactual.model is not None:
        term: ExprRef
        for term in terms:
            if term.sort().kind() == Z3_UNINTERPRETED_SORT:
                continue
            original: ExprRef = model.evaluate(term, model_completion=True)
            replacement: ExprRef = counterfactual.model.evaluate(term, model_completion=True)
            if not _same_value(original, replacement):
                changes.append(ValueChange(str(term), str(original), str(replacement)))
        changes.extend(_interpretation_changes(model, counterfactual.model, functions))
    return Explanation(
        tuple(generalizations), tuple(literal_sets), complete, coverage_unknown, uncovered,
        limit_reached, minimal, counterfactual, tuple(changes),
    )


class SemanticDiffTool:
    """Coordinate parsing, matching, and semantic analysis of two scripts."""

    def __init__(
        self,
        script_a_text: str,
        script_b_text: str,
        *,
        matching: str = "align",
        encoding: str = "direct",
        explain: bool = True,
        timeout_ms: int | None = DEFAULT_TIMEOUT_MS,
        max_generalizations: int = DEFAULT_MAX_GENERALIZATIONS,
        semantics: str = "queries",
        translate: bool = True,
        time_budget_s: float | None = None,
        use_logic: bool = True,
    ) -> None:
        """Parse both scripts and plan the comparison without calling a solver.

        ``semantics="one-set"`` reduces each script to the query of its final
        assertion stack; ``translate=False`` disables the Int-Real embedding
        and the extension by definition, so such symbols are renamed apart.
        Both are ablations; the defaults are the reference configuration.
        ``time_budget_s`` bounds the wall-clock time of the explanations and
        counterfactuals of one ``analyze()`` call (counted from its start).
        The status and direction checks always run, so the relations and the
        verdict do not depend on the budget.
        With ``use_logic``, the status and direction checks of a query pair use
        the least upper bound of the two logics set by ``set-logic`` (see
        :mod:`logics`) if it covers the formulas of the pair, and Z3's default
        solver otherwise; a check that is undecided for this logic is repeated
        with Z3's default solver.  Without a least upper bound, and with
        ``use_logic=False``, all checks use Z3's default solver.  The
        explanations and the certifier always use Z3's default solver.
        """

        if encoding not in ENCODINGS:
            raise ValueError(f"unknown encoding '{encoding}' (expected one of {', '.join(ENCODINGS)})")
        if semantics not in SEMANTICS:
            raise ValueError(f"unknown semantics '{semantics}' (expected one of {', '.join(SEMANTICS)})")
        self.raw_A: str = script_a_text
        self.raw_B: str = script_b_text
        self.semantics: str = semantics
        self.translate: bool = translate
        one_set: bool = semantics == "one-set"
        self.script_a: Script = self._parse(script_a_text, "A", one_set)
        self.script_b: Script = self._parse(script_b_text, "B", one_set)
        self.matching: str = matching
        self.explain: bool = explain
        self.timeout_ms: int | None = timeout_ms or None
        self.max_generalizations: int = max_generalizations
        self.time_budget_s: float | None = time_budget_s
        self.matches: tuple[QueryMatch, ...] = match_queries(self.script_a.queries, self.script_b.queries, matching)
        reserved: frozenset[str] = self.script_a.symbol_names | self.script_b.symbol_names
        self.plans: dict[int, PairPlan] = {
            position: plan_pair(self.script_a.queries[match.index_a], self.script_b.queries[match.index_b], reserved, translate)
            for position, match in enumerate(self.matches)
            if match.index_a is not None and match.index_b is not None
        }
        diagnostics: list[str] = [f"[A] {message}" for message in self.script_a.diagnostics]
        diagnostics += [f"[B] {message}" for message in self.script_b.diagnostics]
        self.use_logic: bool = use_logic
        choice: LogicChoice = choose_logic(self.script_a.logic, self.script_b.logic, use_logic)
        self.logic: str | None = choice.logic
        if choice.diagnostic is not None:
            diagnostics.append(choice.diagnostic)
        self.encoding: str = encoding
        if encoding == "selectors":
            hazards: list[str] = selector_hazards((self.script_a, self.script_b))
            if hazards:
                self.encoding = "direct"
                diagnostics.append(
                    "[Info] selector encoding needs one shared Z3 context, which is unsound here ("
                    + "; ".join(hazards) + "); falling back to the direct encoding"
                )
        self.parser_diagnostics: tuple[str, ...] = tuple(diagnostics)
        self.collisions: tuple[CollisionDiagnostic, ...] = tuple(
            collision for plan in self.plans.values() for collision in plan.collisions
        )

    @staticmethod
    def _parse(text: str, side: str, one_set: bool = False) -> Script:
        """Parse one script, labelling errors with the version they belong to."""

        try:
            return SMTParser.parse_script(text, one_set)
        except ScriptError as error:
            raise ScriptError(str(error), version=side) from error
        except SMTLibSyntaxError as error:
            raise ScriptError(f"syntax error at {error}", version=side) from error

    def analyze(self) -> DiffResult:
        """Compare every matched query pair in both directions."""

        with time_budget(self.time_budget_s) as budget:
            shared_ctx: Context | None = Context() if self.encoding == "selectors" else None
            engine: _DirectEngine | _SelectorEngine = (
                _SelectorEngine(shared_ctx, self.timeout_ms) if shared_ctx is not None else _DirectEngine(self.timeout_ms)
            )
            pairs: list[QueryPairResult] = []
            unmatched_a: list[UnmatchedQuery] = []
            unmatched_b: list[UnmatchedQuery] = []
            # What the formulas of each query (pair) use outside the logic, keyed by its label.
            outside_logic: dict[str, str] = {}
            position: int
            match: QueryMatch
            for position, match in enumerate(self.matches):
                ctx: Context = shared_ctx if shared_ctx is not None else Context()
                if match.index_a is not None and match.index_b is not None:
                    pairs.append(self._analyze_pair(self.plans[position], ctx, engine, f"P{len(pairs) + 1}", outside_logic))
                    continue
                side: str = "A" if match.index_a is not None else "B"
                query: Query = self.script_a.queries[match.index_a] if match.index_a is not None else self.script_b.queries[cast(int, match.index_b)]
                encoded: EncodedQuery = encode_query(query, ctx, side)
                logic: str | None = self._logic_for(encoded.asts, f"the unmatched query {side}{query.index}", outside_logic)
                status, _, _ = engine.check(side, ctx, encoded.asts, None, logic)
                (unmatched_a if side == "A" else unmatched_b).append(UnmatchedQuery(side, query, status))
        diagnostics: list[str] = list(self.parser_diagnostics)
        if outside_logic:
            labels: str = ", ".join(f"{label} ({what})" for label, what in outside_logic.items())
            diagnostics.append(
                f"[Info] the formulas of {labels} use symbols outside {self.logic}; their checks use Z3's default solver"
            )
        return DiffResult(
            tuple(pairs), tuple(unmatched_a), tuple(unmatched_b), tuple(diagnostics), self.matching, self.encoding,
            self.semantics, self.translate, budget is not None and budget.exhausted, self.logic, engine.fallbacks,
            len(outside_logic),
        )

    def _logic_for(self, formulas: tuple[BoolRef, ...], label: str, outside_logic: dict[str, str]) -> str | None:
        """Return the logic for checks over ``formulas``: the least upper bound if it covers them, else None."""

        if self.logic is None:
            return None
        missing: str | None = outside(self.logic, formulas)
        if missing is None:
            return self.logic
        outside_logic[label] = missing
        return None

    def _analyze_pair(
        self, plan: PairPlan, ctx: Context, engine: _DirectEngine | _SelectorEngine, label: str = "P1",
        outside_logic: dict[str, str] | None = None,
    ) -> QueryPairResult:
        """Compare one matched pair of queries."""

        encoded_a, encoded_b = encode_pair(plan, ctx)
        logic: str | None = self._logic_for(encoded_a.asts + encoded_b.asts, label, {} if outside_logic is None else outside_logic)
        status_a, _, _ = engine.check("A", ctx, encoded_a.asts, None, logic)
        status_b, _, _ = engine.check("B", ctx, encoded_b.asts, None, logic)
        # The explanation vocabulary is only consumed by explain_divergence; skip it otherwise.
        predicates: list[BoolRef] = []
        terms: list[ExprRef] = []
        functions: list[FuncDeclRef] = []
        if self.explain:
            combined: BoolRef = cast(BoolRef, And(encoded_a.formula, encoded_b.formula))
            predicates = SemanticExplainer.extract_atomic_predicates(combined)
            terms = SemanticExplainer.extract_optimizable_terms(combined)
            functions = SemanticExplainer.extract_function_symbols(combined)
        tightening: DirectionResult = self._analyze_direction(
            engine, "A", ctx, encoded_a, encoded_b, status_a, "Version A", "Version B", predicates, terms, functions, logic,
        )
        relaxation: DirectionResult = self._analyze_direction(
            engine, "B", ctx, encoded_b, encoded_a, status_b, "Version B", "Version A", predicates, terms, functions, logic,
        )
        return QueryPairResult(
            plan.query_a, plan.query_b, encoded_a.formula, encoded_b.formula, status_a, status_b,
            tightening, relaxation, plan.collisions, plan.private_a, plan.private_b, encoded_a, encoded_b,
        )

    def _analyze_direction(
        self,
        engine: _DirectEngine | _SelectorEngine,
        side: str,
        ctx: Context,
        base: EncodedQuery,
        compare: EncodedQuery,
        base_status: str,
        base_name: str,
        compare_name: str,
        predicates: list[BoolRef],
        terms: list[ExprRef],
        functions: Sequence[FuncDeclRef] = (),
        logic: str | None = None,
    ) -> DirectionResult:
        """Analyze the models allowed by ``base`` and rejected by ``compare``."""

        if base_status == "unsat":
            # An unsatisfiable base has no models, so none can be rejected.
            return DirectionResult(base_name, compare_name, False, None, (), None, None, ())
        status, model, reason = engine.check(side, ctx, base.asts, compare.formula, logic)
        if status == "unsat":
            return DirectionResult(base_name, compare_name, False, None, (), None, None, ())
        if status == "unknown" or model is None:
            return DirectionResult(
                base_name, compare_name, False, None, (), None, None, (),
                coverage_complete=False, solver_unknown=True, status="unknown", reason_unknown=reason,
            )
        region: BoolRef = cast(BoolRef, And(base.formula, Not(compare.formula)))
        validated: bool = is_true(model.evaluate(region, model_completion=True))
        violated, undetermined = classify_assertions(compare, model)
        if not self.explain:
            return DirectionResult(
                base_name, compare_name, True, model, violated, None, None, (),
                coverage_complete=False, status="sat", model_validated=validated,
                undetermined_assertions=undetermined,
            )
        explanation: Explanation = explain_divergence(
            base.formula, compare.formula, model, predicates=predicates, terms=terms, functions=functions,
            timeout_ms=self.timeout_ms, max_generalizations=self.max_generalizations,
        )
        generalizations: tuple[BoolRef, ...] = explanation.generalizations
        counterfactual: CounterfactualResult = explanation.counterfactual
        return DirectionResult(
            base_name,
            compare_name,
            True,
            model,
            violated,
            generalizations[0] if generalizations else None,
            counterfactual.model,
            tuple(str(change) for change in explanation.changes),
            generalizations,
            _disjunction(list(generalizations)) if generalizations else None,
            explanation.coverage_complete,
            explanation.uncovered_model,
            False,
            explanation.coverage_unknown,
            status="sat",
            model_validated=validated,
            undetermined_assertions=undetermined,
            generalization_limit_reached=explanation.limit_reached,
            generalizations_minimal=explanation.minimal,
            counterfactual_status=counterfactual.status,
            counterfactual_target=counterfactual.target,
            counterfactual_validated=counterfactual.validated,
            counterfactual_optimized=counterfactual.optimized,
            counterfactual_note=counterfactual.note,
            generalization_literals=explanation.generalization_literals,
            change_details=explanation.changes,
            time_budget_reached=budget_exhausted(),
        )
