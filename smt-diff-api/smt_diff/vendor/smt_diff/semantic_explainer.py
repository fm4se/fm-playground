"""Build explanations and counterfactuals from Z3 expressions.

Soundness contract of the explanation procedures (see ``docs/SEMANTICS.md``):

* :meth:`SemanticExplainer.abduce` returns a conjunction ``E`` of predicate
  literals only after Z3 proved ``background /\\ E /\\ compare``
  unsatisfiable, so ``background /\\ E`` entails ``not compare`` (abduction
  relative to a background theory; without a background, ``E`` alone entails
  ``not compare``).  ``E`` is true in the given model, so ``background /\\ E``
  is consistent whenever the model satisfies the background.  With
  ``minimize=True`` the conjunction is also subset-minimal whenever
  ``minimal`` is reported: dropping any literal makes the entailment fail.
* :meth:`SemanticExplainer.find_counterfactual` returns a model only if it
  satisfies the target formula under Z3's own model evaluation.  Its
  optimality is relative to the lexicographic objective (number of changed
  terms, then numeric/bit distance) as solved by ``z3.Optimize``.
"""

import contextvars
import re
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator
from typing import Iterable, cast

from z3 import (
    And,
    AstVector,
    BV2Int,
    BitVecRef,
    BoolRef,
    BoolVal,
    Context,
    ExprRef,
    Extract,
    FuncDeclRef,
    If,
    IntNumRef,
    ModelRef,
    Not,
    Optimize,
    QuantifierRef,
    RealVal,
    Select,
    Solver,
    SolverFor,
    Store,
    Sum,
    Z3_OP_AND,
    Z3_OP_EQ,
    Z3_OP_FALSE,
    Z3_OP_GE,
    Z3_OP_GT,
    Z3_OP_IFF,
    Z3_OP_IMPLIES,
    Z3_OP_LE,
    Z3_OP_LT,
    Z3_OP_NOT,
    Z3_OP_OR,
    Z3_OP_TRUE,
    Z3_OP_SELECT,
    Z3_OP_STORE,
    Z3_OP_UNINTERPRETED,
    Z3_OP_XOR,
    Z3_UNINTERPRETED_SORT,
    get_var_index,
    eq,
    is_app,
    is_array,
    is_as_array,
    is_bool,
    is_bv,
    is_false,
    is_int,
    is_int_value,
    is_not,
    is_quantifier,
    is_rational_value,
    is_real,
    is_true,
    is_var,
    sat,
    simplify,
    unknown,
    unsat,
)

def _is_unattained(value: ExprRef) -> bool:
    """Return True when an objective value is an infimum/supremum such as ``k + epsilon`` or ``oo``."""

    return re.search(r"\b(epsilon|oo)\b", str(value)) is not None


DESCENT_CHECK_BUDGET: int = 64
DESCENT_REAL_STEPS: int = 20


CONNECTIVES: frozenset[int] = frozenset({
    Z3_OP_AND, Z3_OP_OR, Z3_OP_NOT, Z3_OP_IMPLIES, Z3_OP_IFF, Z3_OP_XOR, Z3_OP_TRUE, Z3_OP_FALSE,
})


def new_solver(ctx: Context, timeout_ms: int | None, logic: str | None = None) -> Solver:
    """Return a fresh solver in ``ctx`` with an optional timeout, for ``logic`` if given."""

    solver: Solver = SolverFor(logic, ctx=ctx) if logic is not None else Solver(ctx=ctx)
    if timeout_ms is not None:
        solver.set(timeout=timeout_ms)
    return solver


def status_name(result: object) -> str:
    """Return ``sat``, ``unsat`` or ``unknown`` for a Z3 check result."""

    if result == sat:
        return "sat"
    if result == unsat:
        return "unsat"
    return "unknown"


TIME_BUDGET_REASON: str = "time budget exhausted"
NO_TIMEOUT_MS: int = 4_294_967_295   # Z3's largest timeout value, i.e. no timeout


@dataclass
class TimeBudget:
    """A wall-clock deadline for the explanation and counterfactual checks of one analysis."""

    deadline: float
    exhausted: bool = False


_BUDGET: contextvars.ContextVar[TimeBudget | None] = contextvars.ContextVar("smtdiff_time_budget", default=None)


@contextmanager
def time_budget(seconds: float | None) -> Iterator[TimeBudget | None]:
    """Run the enclosed checks under a time budget of ``seconds`` (None: no budget)."""

    if seconds is None:
        yield None
        return
    budget: TimeBudget = TimeBudget(time.monotonic() + seconds)
    token = _BUDGET.set(budget)
    try:
        yield budget
    finally:
        _BUDGET.reset(token)


def budget_exhausted() -> bool:
    """Return True when the current time budget has run out."""

    budget: TimeBudget | None = _BUDGET.get()
    return budget is not None and budget.exhausted


def checked(solver: Solver | Optimize, timeout_ms: int | None, *assumptions: BoolRef) -> object:
    """Run ``solver.check`` under the per-call timeout and the remaining time budget.

    Without a budget this is ``solver.check(*assumptions)``.  With a budget,
    a call gets at most the remaining time; when no time is left, the call is
    skipped and ``unknown`` is returned.  In both cases the budget is marked
    as exhausted.  Z3's timeout is soft, so a call can still end a little late.
    """

    budget: TimeBudget | None = _BUDGET.get()
    if budget is None:
        return solver.check(*assumptions)
    remaining_ms: int = int((budget.deadline - time.monotonic()) * 1000)
    if remaining_ms <= 0:
        budget.exhausted = True
        return unknown
    clamped: bool = timeout_ms is None or remaining_ms < timeout_ms
    if clamped:
        solver.set(timeout=remaining_ms)
    result = solver.check(*assumptions)
    if clamped:
        if result != sat and result != unsat and time.monotonic() >= budget.deadline - 0.05:
            budget.exhausted = True
        solver.set(timeout=timeout_ms if timeout_ms is not None else NO_TIMEOUT_MS)
    return result


def decide(model: ModelRef, formula: BoolRef, timeout_ms: int | None = None) -> bool | None:
    """Return the truth value of ``formula`` in ``model``, or None if it cannot be decided.

    Z3's evaluator may leave a quantified formula unreduced.  The residual it
    returns has every symbol of the model substituted, so its truth value is
    the formula's truth value in the model: it is false if the residual is
    unsatisfiable and true if its negation is.  Leftover constants (such as
    elements of uninterpreted sorts) are free in that check, which only makes
    each verdict stronger.
    """

    value: ExprRef = model.evaluate(formula, model_completion=True)
    if is_true(value):
        return True
    if is_false(value):
        return False
    residual: BoolRef = cast(BoolRef, value)
    solver: Solver = new_solver(residual.ctx, timeout_ms)
    solver.add(residual)
    if checked(solver, timeout_ms) == unsat:
        return False
    solver = new_solver(residual.ctx, timeout_ms)
    solver.add(Not(residual))
    if checked(solver, timeout_ms) == unsat:
        return True
    return None


@dataclass(frozen=True)
class AbductionResult:
    """Outcome of one abduction step.

    ``status`` is ``explained`` (``explanation`` entails the negated compare
    formula), ``not-explainable`` (the predicate literals true in the model do
    not determine the compare formula) or ``unknown`` (Z3 gave up).
    """

    status: str
    explanation: BoolRef | None = None
    literals: tuple[BoolRef, ...] = ()
    minimal: bool = False


@dataclass(frozen=True)
class CounterfactualResult:
    """Outcome of the nearest-model search.

    ``target`` is ``both`` when the model satisfies both formulas,
    ``compare`` when Z3 proved that no model satisfies both (so the model only
    satisfies the compare formula), and ``compare-unknown`` when Z3 could not
    decide whether both can be satisfied.  ``optimized`` is True only when the
    reported model attains the optimum; ``note`` says why it does not (for
    example an infimum ``k + epsilon`` that no model attains).
    """

    status: str
    model: ModelRef | None = None
    target: str | None = None
    validated: bool = False
    optimized: bool = True
    note: str = ""


class SemanticExplainer:
    """Provide reusable semantic operations for SMT difference analysis."""

    @staticmethod
    def _has_free_vars(node: ExprRef, bound_depth: int = 0, memo: dict[tuple[int, int], bool] | None = None) -> bool:
        """Return True if the expression has de Bruijn variables free at the given depth.

        A ``Var(k)`` is free when ``k >= bound_depth``.  Entering a
        quantifier body increments the depth by the number of variables
        the quantifier binds, so properly-scoped bound variables are
        not treated as free.

        Terms are DAGs (definitions are expanded, so subterms are shared);
        results are memoised per (term id, depth) so the walk is linear in
        the DAG instead of the - possibly exponential - tree size. Callers
        that test many subterms of one formula pass one ``memo`` for all calls.
        """

        if memo is None:
            memo = {}
        key: tuple[int, int] = (node.get_id(), bound_depth)
        cached: bool | None = memo.get(key)
        if cached is not None:
            return cached
        result: bool
        if is_var(node):
            result = get_var_index(node) >= bound_depth
        elif is_quantifier(node):
            q: QuantifierRef = cast(QuantifierRef, node)
            result = SemanticExplainer._has_free_vars(q.body(), bound_depth + q.num_vars(), memo)
        else:
            result = any(SemanticExplainer._has_free_vars(child, bound_depth, memo) for child in node.children())
        memo[key] = result
        return result

    @staticmethod
    def has_quantifier(expr: ExprRef) -> bool:
        """Return True if ``expr`` contains a quantifier or lambda."""

        seen: set[int] = set()
        pending: list[ExprRef] = [expr]
        while pending:
            node: ExprRef = pending.pop()
            if node.get_id() in seen:
                continue
            seen.add(node.get_id())
            if is_quantifier(node):
                return True
            pending.extend(node.children())
        return False

    @staticmethod
    def extract_atomic_predicates(expr: ExprRef) -> list[BoolRef]:
        """Return the closed atomic Boolean predicates of an expression tree.

        Quantified subformulas without free de Bruijn variables are atoms too.
        Lambdas are terms, not formulas (z3py's ``QuantifierRef`` is a
        ``BoolRef`` even for a lambda), so they are not atoms; their bodies are
        still searched.  The result is ordered deterministically by first
        occurrence.
        """

        predicates: dict[int, BoolRef] = {}
        seen: set[int] = set()
        free_memo: dict[tuple[int, int], bool] = {}

        def walk(node: ExprRef) -> None:
            if node.get_id() in seen:
                return
            seen.add(node.get_id())
            if is_quantifier(node):
                quantifier: QuantifierRef = cast(QuantifierRef, node)
                if not quantifier.is_lambda() and not SemanticExplainer._has_free_vars(node, 0, free_memo):
                    predicates.setdefault(node.get_id(), cast(BoolRef, node))
                walk(quantifier.body())
                return
            if is_bool(node) and is_app(node) and node.decl().kind() not in CONNECTIVES:
                if not SemanticExplainer._has_free_vars(node, 0, free_memo):
                    predicates.setdefault(node.get_id(), cast(BoolRef, node))
            child: ExprRef
            for child in node.children():
                walk(child)

        walk(expr)
        return list(predicates.values())

    @staticmethod
    def extract_optimizable_terms(expr: ExprRef) -> list[ExprRef]:
        """Return closed uninterpreted terms (constants and applications) of an expression."""

        terms: dict[int, ExprRef] = {}
        seen: set[int] = set()
        free_memo: dict[tuple[int, int], bool] = {}

        def walk(node: ExprRef) -> None:
            if node.get_id() in seen:
                return
            seen.add(node.get_id())
            if is_app(node) and node.decl().kind() == Z3_OP_UNINTERPRETED:
                if not SemanticExplainer._has_free_vars(node, 0, free_memo):
                    terms.setdefault(node.get_id(), node)
            child: ExprRef
            for child in node.children():
                walk(child)
            if is_quantifier(node):
                walk(cast(QuantifierRef, node).body())

        walk(expr)
        return list(terms.values())

    @staticmethod
    def literals_of(model: ModelRef, predicates: Iterable[BoolRef], timeout_ms: int | None = None) -> list[BoolRef]:
        """Return the predicate literals whose truth value the model determines."""

        literals: list[BoolRef] = []
        predicate: BoolRef
        for predicate in predicates:
            value: bool | None = decide(model, predicate, timeout_ms)
            if value is True:
                literals.append(predicate)
            elif value is False:
                literals.append(cast(BoolRef, Not(predicate)))
        return literals

    @staticmethod
    def abduce(
        compare_formula: BoolRef,
        model: ModelRef,
        predicates: Iterable[BoolRef],
        timeout_ms: int | None = None,
        minimize: bool = True,
        background: BoolRef | None = None,
    ) -> AbductionResult:
        """Find literals true in ``model`` that, together with ``background``, entail ``not compare_formula``."""

        literals: list[BoolRef] = SemanticExplainer.literals_of(model, predicates, timeout_ms)
        solver: Solver = new_solver(compare_formula.ctx, timeout_ms)
        if background is not None:
            solver.add(background)
        solver.add(compare_formula)
        result = checked(solver, timeout_ms, *literals)
        if result == sat:   # Trying to explain a model (lifted to literals) which is not a witness or literals no longer have sufficient information for contradiction (witnesses violate compare_formula)
            return AbductionResult("not-explainable")
        if result != unsat:
            return AbductionResult("unknown")
        core_vector: AstVector = solver.unsat_core()
        core: list[BoolRef] = [cast(BoolRef, core_vector[index]) for index in range(len(core_vector))]
        minimal: bool = False
        if minimize:
            minimal = True
            position: int = 0
            while position < len(core):
                trial: list[BoolRef] = core[:position] + core[position + 1:]
                outcome = checked(solver, timeout_ms, *trial)
                if outcome == unsat:
                    core = trial
                elif outcome == sat:
                    position += 1
                else:
                    minimal = False
                    position += 1
        explanation: BoolRef
        if not core:
            explanation = BoolVal(True, compare_formula.ctx)
        elif len(core) == 1:
            explanation = core[0]
        else:
            explanation = cast(BoolRef, simplify(And(core)))
        return AbductionResult("explained", explanation, tuple(core), minimal)

    @staticmethod
    def compute_abduction(compare_formula: BoolRef, model: ModelRef, predicates: Iterable[BoolRef]) -> ExprRef | None:
        """Return an explanation entailing ``not compare_formula``, or None when none was found."""

        return SemanticExplainer.abduce(compare_formula, model, predicates).explanation

    @staticmethod
    def _distance(term: ExprRef, value: ExprRef) -> ExprRef | None:
        """Return a non-negative distance between ``term`` and its original ``value``."""

        if is_int(term) and is_int_value(value):
            return cast(ExprRef, If(term >= value, term - value, value - term))
        if is_real(term) and is_rational_value(value):
            return cast(ExprRef, If(term >= value, term - value, value - term))
        if is_bv(term):
            xor: BitVecRef = cast(BitVecRef, term) ^ cast(BitVecRef, value)
            width: int = cast(BitVecRef, term).size()
            return cast(ExprRef, Sum([BV2Int(Extract(bit, bit, xor), is_signed=False) for bit in range(width)]))
        return None

    @staticmethod
    def find_counterfactual(
        base_formula: BoolRef,
        compare_formula: BoolRef,
        model: ModelRef,
        variables: Iterable[ExprRef],
        timeout_ms: int | None = None,
    ) -> CounterfactualResult:
        """Find a model of the compare formula that differs little from ``model``.

        The search prefers models of ``base /\\ compare`` (agreement of both
        versions) and falls back to models of ``compare`` alone.  It minimises
        lexicographically the number of changed terms, then the L1 distance of
        numeric terms and the Hamming distance of bit-vectors.  Terms of
        uninterpreted sorts are ignored because their values are only
        meaningful inside one model.  When the optimiser cannot handle the
        target (quantifiers, non-linear arithmetic) the same objectives are
        minimised by plain solver checks (:meth:`_descend`); ``optimized`` is
        then True only if each optimum was proven.
        """

        ctx: Context = compare_formula.ctx
        both: BoolRef = cast(BoolRef, And(base_formula, compare_formula))
        probe: Solver = new_solver(ctx, timeout_ms)
        probe.add(both)
        agreement = checked(probe, timeout_ms)
        target_name: str = "both" if agreement == sat else "compare" if agreement == unsat else "compare-unknown"
        target: BoolRef = both if target_name == "both" else compare_formula
        def unoptimized() -> CounterfactualResult:
            """Return a plain model of the target when optimisation is not possible."""

            if target_name == "both":
                witness: ModelRef = probe.model()
            else:
                fallback: Solver = new_solver(ctx, timeout_ms)
                fallback.add(target)
                outcome = checked(fallback, timeout_ms)
                if outcome != sat:
                    return CounterfactualResult("none" if outcome == unsat else "unknown")
                witness = fallback.model()
            return CounterfactualResult(
                "found", witness, target_name, is_true(witness.evaluate(target, model_completion=True)), optimized=False,
            )

        accesses: dict[int, list[tuple[ExprRef, ...]]] = SemanticExplainer._array_accesses(both)
        changed: list[ExprRef] = []
        frames: list[ExprRef] = []
        distances: list[ExprRef] = []
        skipped: list[str] = []
        variable: ExprRef
        for variable in variables:
            if variable.sort().kind() == Z3_UNINTERPRETED_SORT:
                continue
            value: ExprRef = model.evaluate(variable, model_completion=True)
            if not SemanticExplainer._portable(value):
                # Lambdas and as-array values refer to model-internal state;
                # comparing with them in another solver would be meaningless.
                skipped.append(str(variable))
                continue
            changed.append(cast(ExprRef, If(variable == value, 0, 1)))
            if is_array(variable) and variable.get_id() in accesses:
                # Prefer edits confined to the indices the formulas access.
                frame: ExprRef = value
                index: tuple[ExprRef, ...]
                for index in accesses[variable.get_id()]:
                    frame = Store(frame, *index, Select(variable, *index))
                frames.append(cast(ExprRef, If(variable == frame, 0, 1)))
            distance: ExprRef | None = SemanticExplainer._distance(variable, value)
            if distance is not None:
                distances.append(distance)
        sums: list[ExprRef] = [cast(ExprRef, Sum(terms)) for terms in (changed, frames, distances) if terms]
        note: str = f"not compared (model-internal values): {', '.join(skipped)}" if skipped else ""

        def descended() -> CounterfactualResult:
            """Minimise the objectives with plain solver checks, starting from any model of the target."""

            plain: CounterfactualResult = unoptimized()
            if plain.model is None or not sums:
                return plain
            best, proven, reason = SemanticExplainer._descend(target, sums, plain.model, timeout_ms)
            return CounterfactualResult(
                "found", best, target_name, is_true(best.evaluate(target, model_completion=True)),
                optimized=proven and not skipped,
                note="; ".join(part for part in (note, "" if proven else f"solver descent stopped: {reason}") if part),
            )

        if SemanticExplainer.has_quantifier(target):
            # z3.Optimize does not support quantified constraints.
            return descended()
        optimizer: Optimize = Optimize(ctx=ctx)
        if timeout_ms is not None:
            optimizer.set(timeout=timeout_ms)
        optimizer.add(target)
        objectives: list = [optimizer.minimize(objective) for objective in sums]
        result = checked(optimizer, timeout_ms)
        if result == unsat:
            return CounterfactualResult("none")
        if result != sat:
            # For example non-linear arithmetic, which z3.Optimize does not decide.
            return descended()
        found: ModelRef = optimizer.model()
        validated: bool = is_true(found.evaluate(target, model_completion=True))
        unattained: list[str] = [str(objective.value()) for objective in objectives if _is_unattained(objective.value())]
        if unattained:
            return CounterfactualResult(
                "found", found, target_name, validated, optimized=False,
                note=f"the optimal distance is an infimum that no model attains ({', '.join(unattained)}); the model is near it, not optimal",
            )
        return CounterfactualResult("found", found, target_name, validated, optimized=not skipped, note=note)

    @staticmethod
    def _descend(
        target: BoolRef, objectives: list[ExprRef], start: ModelRef, timeout_ms: int | None,
    ) -> tuple[ModelRef, bool, str]:
        """Minimise ``objectives`` lexicographically over models of ``target`` with plain solver checks.

        This is the fallback where ``z3.Optimize`` gives up (quantifiers,
        non-linear arithmetic).  Each objective is bisected between 0 and its
        value in the best model so far; a satisfiable probe lowers the upper
        bound to the new model's value.  An objective counts as optimal only
        once ``objective < best`` is unsatisfiable, so an unattained infimum is
        never reported as optimal.  The optimum is then fixed before the next
        objective.  Returns the best model, whether every optimum was proven,
        and why not otherwise.
        """

        solver: Solver = new_solver(target.ctx, timeout_ms)
        solver.add(target)
        best: ModelRef = start
        checks: int = 0

        def probe(bound: BoolRef) -> object:
            """Check ``target /\\ bound``; a model found becomes the new best."""

            nonlocal best, checks
            checks += 1
            solver.push()
            solver.add(bound)
            outcome = checked(solver, timeout_ms)
            if outcome == sat:
                best = solver.model()
            solver.pop()
            return outcome

        def value(objective: ExprRef) -> ExprRef | None:
            """Return the objective's value in the best model, or None if it is not a number.

            The evaluator can leave a value unreduced, for example the equality
            of two arrays, which it may return as an existential formula.
            """

            result: ExprRef = best.evaluate(objective, model_completion=True)
            return result if is_int_value(result) or is_rational_value(result) else None

        no_value: str = "an objective has no numeric value in the model"
        objective: ExprRef
        for objective in objectives:
            if is_int(objective):
                low: int = 0
                start_value: ExprRef | None = value(objective)
                if start_value is None:
                    return best, False, no_value
                high: int = cast(IntNumRef, start_value).as_long()
                while low < high:
                    if checks >= DESCENT_CHECK_BUDGET:
                        return best, False, "check budget exhausted"
                    outcome = probe(cast(BoolRef, objective <= (low + high) // 2))
                    if outcome == unsat:
                        low = (low + high) // 2 + 1
                        continue
                    if outcome != sat:
                        # Proving that nothing is below the bisection point is often harder
                        # than proving that nothing beats the current model.
                        outcome = probe(cast(BoolRef, objective < high))
                        if outcome == unsat:
                            break
                        if outcome != sat:
                            return best, False, "a solver check returned unknown"
                    new_value: ExprRef | None = value(objective)
                    if new_value is None:
                        return best, False, no_value
                    high = cast(IntNumRef, new_value).as_long()
                solver.add(objective == high)
                continue
            lower: ExprRef = RealVal(0, target.ctx)
            upper_value: ExprRef | None = value(objective)
            if upper_value is None:
                return best, False, no_value
            upper: ExprRef = upper_value
            steps: int = 0
            while steps < DESCENT_REAL_STEPS and checks < DESCENT_CHECK_BUDGET and not is_true(simplify(upper <= lower)):
                middle: ExprRef = simplify((lower + upper) / 2)
                outcome = probe(cast(BoolRef, objective <= middle))
                if outcome == sat:
                    next_value: ExprRef | None = value(objective)
                    if next_value is None:
                        return best, False, no_value
                    upper = next_value
                elif outcome == unsat:
                    lower = middle
                else:
                    break
                steps += 1
            if checks >= DESCENT_CHECK_BUDGET:
                return best, False, "check budget exhausted"
            outcome = probe(cast(BoolRef, objective < upper))
            if outcome == sat:
                return best, False, "the distance kept decreasing (possibly an infimum that no model attains)"
            if outcome != unsat:
                return best, False, "a solver check returned unknown"
            solver.add(objective == upper)
        return best, True, ""

    @staticmethod
    def _portable(value: ExprRef) -> bool:
        """Return True when a model value can be compared with terms in another solver."""

        pending: list[ExprRef] = [value]
        while pending:
            node: ExprRef = pending.pop()
            if is_quantifier(node) or is_as_array(node):
                return False
            pending.extend(node.children())
        return True

    @staticmethod
    def _array_accesses(expr: ExprRef) -> dict[int, list[tuple[ExprRef, ...]]]:
        """Map each array term to the closed index tuples at which ``expr`` reads or writes it."""

        accesses: dict[int, list[tuple[ExprRef, ...]]] = {}
        seen: set[int] = set()
        free_memo: dict[tuple[int, int], bool] = {}
        pending: list[ExprRef] = [expr]
        while pending:
            node: ExprRef = pending.pop()
            if node.get_id() in seen:
                continue
            seen.add(node.get_id())
            if is_quantifier(node):
                pending.append(cast(QuantifierRef, node).body())
                continue
            if is_app(node) and node.decl().kind() in (Z3_OP_SELECT, Z3_OP_STORE):
                children: list[ExprRef] = node.children()
                index: tuple[ExprRef, ...] = tuple(children[1:] if node.decl().kind() == Z3_OP_SELECT else children[1:-1])
                if not any(SemanticExplainer._has_free_vars(part, 0, free_memo) for part in index):
                    known: list[tuple[ExprRef, ...]] = accesses.setdefault(children[0].get_id(), [])
                    if not any(all(eq(left, right) for left, right in zip(entry, index)) for entry in known):
                        known.append(index)
            pending.extend(node.children())
        return accesses

    @staticmethod
    def extract_function_symbols(expr: ExprRef) -> list[FuncDeclRef]:
        """Return the uninterpreted function symbols of positive arity in ``expr`` (also under binders)."""

        found: dict[str, FuncDeclRef] = {}
        seen: set[int] = set()
        pending: list[ExprRef] = [expr]
        while pending:
            node: ExprRef = pending.pop()
            if node.get_id() in seen:
                continue
            seen.add(node.get_id())
            if is_quantifier(node):
                pending.append(cast(QuantifierRef, node).body())
                continue
            if is_app(node) and node.decl().kind() == Z3_OP_UNINTERPRETED and node.decl().arity() > 0:
                found.setdefault(node.decl().name() + "/" + str(node.decl().get_id()), node.decl())
            pending.extend(node.children())
        return list(found.values())

    @staticmethod
    def compute_counterfactual(base_formula: BoolRef, compare_formula: BoolRef, model: ModelRef, variables: Iterable[ExprRef]) -> ModelRef | None:
        """Return a nearby model accepted by the compare formula, or None."""

        return SemanticExplainer.find_counterfactual(base_formula, compare_formula, model, variables).model

    @staticmethod
    def humanize_predicate(predicate: ExprRef) -> str:
        """Render a comparison expression in concise human-readable form."""

        if is_not(predicate):
            child: ExprRef = predicate.children()[0]
            if is_app(child):
                kind: int = child.decl().kind()
                args: list[ExprRef] = list(child.children())
                operators: dict[int, str] = {Z3_OP_LE: ">", Z3_OP_LT: ">=", Z3_OP_GE: "<", Z3_OP_GT: "<=", Z3_OP_EQ: "!="}
                if kind in operators and len(args) == 2:
                    return f"{args[0]} {operators[kind]} {args[1]}"
        if is_app(predicate):
            kind = predicate.decl().kind()
            args = list(predicate.children())
            operators = {Z3_OP_LE: "<=", Z3_OP_LT: "<", Z3_OP_GE: ">=", Z3_OP_GT: ">", Z3_OP_EQ: "=="}
            converse: dict[int, str] = {Z3_OP_LE: ">=", Z3_OP_LT: ">", Z3_OP_GE: "<=", Z3_OP_GT: "<", Z3_OP_EQ: "=="}
            if len(args) == 2 and kind in operators:
                if (is_int_value(args[0]) or is_rational_value(args[0])) and not (is_int_value(args[1]) or is_rational_value(args[1])):
                    return f"{args[1]} {converse[kind]} {args[0]}"
                return f"{args[0]} {operators[kind]} {args[1]}"
        return str(predicate)

    @classmethod
    def format_explanation(cls, expression: ExprRef | None) -> str:
        """Format a predicate or conjunction returned by the explainer."""

        if expression is None:
            return "(Could not generalize region)"
        if is_app(expression) and expression.decl().kind() == Z3_OP_AND:
            clauses: list[str] = [cls.humanize_predicate(child) for child in expression.children()]
            return " AND ".join(clauses)
        return cls.humanize_predicate(expression)
