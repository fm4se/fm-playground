"""Abductive and counterfactual explanations of propositional diff witnesses for two Limboole formulas.

Abductive explanation (AXp, PI-explanation): 
    A subset-minimal set E of witness literals with base /\\ E |= not compare.  
    E is a minimal unsatisfiable subset of the witness literals as assumptions for base /\\ compare: 
    the solver's unsat core, shrunk by deletion.  E is true in the witness, which satisfies base, 
    so base /\\ E is consistent.  Unlike the SMTDiff, an explanation always exists, because the whole witness entails the outcome.
Coverage: 
    Further explanations are computed for witnesses outside 
    E_1 \\/ ... \\/ E_k until base /\\ not compare /\\ not E_1 /\\ ... is unsatisfiable; 
    then base /\\ not compare == base /\\ (E_1 \\/ ... ) (a prime-implicant cover of the difference relative to base).
Counterfactual (contrastive explanation, CXp): 
    A model of base /\\ compare (or of compare when the two formulas are disjoint) at minimum Hamming distance from the witness: 
    partial MaxSAT with the target as hard clauses and one soft unit clause per witness literal.  
    The flipped variables form a minimum correction set.  
    AXps and CXps are minimal hitting sets of each other.
"""

import threading
import time
from dataclasses import dataclass, field
from typing import Any

from pysat.examples.rc2 import RC2
from pysat.formula import WCNF
from pysat.solvers import Solver

from .cnf import Encoder
from .parser import And, LimbooleSyntaxError, Node, Not, evaluate, parse, to_text, variables

Assignment = dict[str, bool]

SOLVER_NAME: str = "g4"  # Glucose 4: assumptions, unsat cores and interrupts
DEFAULT_MAX_GENERALIZATIONS: int = 64
DEFAULT_MAX_ALTERNATIVES: int = 5
MODES: dict[str, tuple[str, str]] = {
    # mode -> (base, compare): the region is base /\ not compare
    "not-current-but-previous": ("previous", "current"),
    "not-previous-but-current": ("current", "previous"),
}


@dataclass(frozen=True)
class Literal:
    name: str
    value: bool

    def __str__(self) -> str:
        return self.name if self.value else f"!{self.name}"


@dataclass(frozen=True)
class ValueChange:
    symbol: str
    before: bool
    after: bool


@dataclass(frozen=True)
class AbductionResult:
    """A conjunction of witness literals with base /\\ literals |= not compare."""

    literals: tuple[Literal, ...]
    minimal: bool


@dataclass(frozen=True)
class CoverageResult:
    """Explanations E_1 ... E_n; coverage is complete, limit-reached or incomplete (time)."""

    generalizations: tuple[AbductionResult, ...]
    coverage: str
    uncovered: Assignment | None


@dataclass(frozen=True)
class CounterfactualResult:
    """The nearest model of the target; target is both or compare."""

    status: str  # found | none
    target: str | None = None
    model: Assignment | None = None
    changes: tuple[ValueChange, ...] = ()
    alternatives: tuple[tuple[ValueChange, ...], ...] = field(default=())
    optimized: bool = True


class WitnessError(ValueError):
    """The assignment is not a witness of the region."""


class DiffExplainer:
    """Explain witnesses of base /\\ not compare for two parsed formulas."""

    def __init__(self, base: Node, compare: Node, deadline: float | None = None) -> None:
        self.base = base
        self.compare = compare
        self.deadline = deadline
        self.names: list[str] = list(dict.fromkeys(variables(base) + variables(compare)))
        self.encoder = Encoder()
        self.base_literal = self.encoder.encode(base)
        self.compare_literal = self.encoder.encode(compare)
        for name in self.names:
            self.encoder.variable(name)

    # -- helpers ---------------------------------------------------------------

    def _solver(self, *units: int) -> Solver:
        solver = Solver(name=SOLVER_NAME, bootstrap_with=self.encoder.definitions)
        for unit in units:
            solver.add_clause([unit])
        return solver

    def _solve(self, solver: Solver, assumptions: list[int] = ()) -> bool | None:
        """Solve under the deadline: True/False, or None when the time is up."""

        if self.deadline is None:
            return solver.solve(assumptions=assumptions)
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            return None
        timer = threading.Timer(remaining, solver.interrupt)
        timer.start()
        try:
            return solver.solve_limited(assumptions=assumptions, expect_interrupt=True)
        finally:
            timer.cancel()
            solver.clear_interrupt()

    def _assignment(self, model: list[int]) -> Assignment:
        values = {abs(literal): literal > 0 for literal in model}
        return {name: values.get(self.encoder.variable(name), False) for name in self.names}

    def _literal_of(self, number: int) -> Literal:
        name = self.encoder.pool.obj(abs(number))[1]
        return Literal(name, number > 0)

    def witness_literals(self, witness: Assignment) -> list[int]:
        return [self.encoder.literal(name, witness[name]) for name in self.names]

    def check_witness(self, witness: Assignment) -> None:
        """Raise :class:`WitnessError` unless witness is a total model of base /\\ not compare."""

        missing = [name for name in self.names if name not in witness]
        if missing:
            raise WitnessError(f"the witness does not assign {', '.join(missing)}")
        unknown = [name for name in witness if name not in set(self.names)]
        if unknown:
            raise WitnessError(f"the witness assigns variables of neither formula: {', '.join(unknown)}")
        if not evaluate(self.base, witness) or evaluate(self.compare, witness):
            raise WitnessError("the assignment is not in the difference region")

    # -- abduction ---------------------------------------------------------------

    def abduce(self, witness: Assignment, solver: Solver | None = None) -> AbductionResult:
        """Return a subset-minimal set of witness literals with base /\\ E |= not compare."""

        own = solver is None
        solver = solver or self._solver(self.base_literal, self.compare_literal)
        try:
            literals = self.witness_literals(witness)
            outcome = self._solve(solver, literals)
            if outcome is None:
                # Out of time: the whole witness is a (non-minimal) explanation.
                return AbductionResult(tuple(self._literal_of(number) for number in literals), minimal=False)
            assert outcome is False, "a witness of base /\\ not compare cannot satisfy base /\\ compare"
            order = {number: index for index, number in enumerate(literals)}
            core = sorted(solver.get_core() or [], key=order.__getitem__)
            minimal = True
            position = 0
            while position < len(core):
                trial = core[:position] + core[position + 1:]
                outcome = self._solve(solver, trial)
                if outcome is False:
                    # Keep only the part of the new core inside the trial (it can be smaller still).
                    reduced = set(solver.get_core() or [])
                    core = [number for number in trial if number in reduced]
                elif outcome is True:
                    position += 1
                else:
                    minimal = False
                    break
            return AbductionResult(tuple(self._literal_of(number) for number in core), minimal)
        finally:
            if own:
                solver.delete()

    def cover(
        self, witness: Assignment, first: AbductionResult | None = None,
        max_generalizations: int = DEFAULT_MAX_GENERALIZATIONS,
    ) -> CoverageResult:
        """Explain witness, then uncovered witnesses, until the explanations cover the region."""

        entail = self._solver(self.base_literal, self.compare_literal)
        region = self._solver(self.base_literal, -self.compare_literal)
        try:
            generalizations: list[AbductionResult] = []
            current: AbductionResult = first or self.abduce(witness, entail)
            while True:
                generalizations.append(current)
                if not current.literals:
                    return CoverageResult(tuple(generalizations), "complete", None)
                region.add_clause([-self.encoder.literal(literal.name, literal.value) for literal in current.literals])
                outcome = self._solve(region)
                if outcome is False:
                    return CoverageResult(tuple(generalizations), "complete", None)
                if outcome is None:
                    return CoverageResult(tuple(generalizations), "incomplete", None)
                uncovered = self._assignment(region.get_model())
                if len(generalizations) >= max_generalizations:
                    return CoverageResult(tuple(generalizations), "limit-reached", uncovered)
                current = self.abduce(uncovered, entail)
        finally:
            entail.delete()
            region.delete()

    # -- counterfactual ----------------------------------------------------------

    def counterfactual(self, witness: Assignment, max_alternatives: int = DEFAULT_MAX_ALTERNATIVES) -> CounterfactualResult:
        """Return the model of the target nearest to witness in Hamming distance (exact, via MaxSAT)."""

        probe = self._solver(self.base_literal, self.compare_literal)
        try:
            both = probe.solve()
        finally:
            probe.delete()
        target, units = ("both", [self.base_literal, self.compare_literal]) if both else ("compare", [self.compare_literal])
        wcnf = WCNF()
        wcnf.extend(self.encoder.definitions)
        for unit in units:
            wcnf.append([unit])
        for number in self.witness_literals(witness):
            wcnf.append([number], weight=1)
        flip_sets: list[tuple[ValueChange, ...]] = []
        best: Assignment | None = None
        with RC2(wcnf, solver=SOLVER_NAME) as rc2:
            # block=-1 blocks each correction set (and its supersets), so the
            # models enumerated at the minimum cost flip different variable sets.
            for model in rc2.enumerate(block=-1):
                if flip_sets and rc2.cost > len(flip_sets[0]):
                    break
                assignment = self._assignment(model)
                best = best or assignment
                flip_sets.append(self._changes(witness, assignment))
                if len(flip_sets) > max_alternatives:
                    break
        if best is None:
            return CounterfactualResult("none")
        return CounterfactualResult("found", target, best, flip_sets[0], tuple(flip_sets[1:]))

    def _changes(self, before: Assignment, after: Assignment) -> tuple[ValueChange, ...]:
        return tuple(ValueChange(name, before[name], after[name]) for name in self.names if before[name] != after[name])


# -- request entry point (runs in a worker process; returns plain data) ---------


def _top_conjuncts(node: Node) -> list[Node]:
    return list(node.args) if isinstance(node, And) else [node]


def _literals_to_dict(result: AbductionResult) -> dict[str, Any]:
    return {
        "text": " & ".join(str(literal) for literal in result.literals) if result.literals else "true",
        "literals": [{"name": literal.name, "value": literal.value, "text": str(literal)} for literal in result.literals],
        "minimal": result.minimal,
    }


def _changes_to_list(changes: tuple[ValueChange, ...]) -> list[dict[str, Any]]:
    return [{"symbol": change.symbol, "before": int(change.before), "after": int(change.after)} for change in changes]


def _model_to_list(model: Assignment | None, names: list[str]) -> list[dict[str, Any]] | None:
    return None if model is None else [{"name": name, "value": int(model[name])} for name in names]


def explain_witness(
    previous: str, current: str, mode: str, assignment: Assignment,
    max_generalizations: int = DEFAULT_MAX_GENERALIZATIONS, coverage_budget_s: float | None = None,
) -> dict[str, Any]:
    """Explain one witness of a diff region of two Limboole formulas; returns JSON-ready data.

    On bad input the result is {"error": {"code", "message", "script"}}.
    """

    if mode not in MODES:
        return {"error": {"code": "invalid_mode", "message": f"cannot explain mode '{mode}'", "script": None}}
    texts = {"previous": previous, "current": current}
    formulas: dict[str, Node] = {}
    for side, text in texts.items():
        try:
            formulas[side] = parse(text)
        except LimbooleSyntaxError as error:
            return {"error": {"code": "parse_error", "message": str(error), "script": side}}
    base_side, compare_side = MODES[mode]
    explainer = DiffExplainer(formulas[base_side], formulas[compare_side])
    try:
        explainer.check_witness(assignment)
    except WitnessError as error:
        return {"error": {"code": "invalid_witness", "message": str(error), "script": None}}

    first = explainer.abduce(assignment)
    counterfactual = explainer.counterfactual(assignment)
    explainer.deadline = None if coverage_budget_s is None else time.monotonic() + coverage_budget_s
    coverage = explainer.cover(assignment, first, max_generalizations)

    private = {
        side: sorted(set(variables(formulas[side])) - set(variables(formulas[other])))
        for side, other in (("previous", "current"), ("current", "previous"))
    }
    return {
        "mode": mode,
        "base": base_side,
        "compare": compare_side,
        "witness": _model_to_list(assignment, explainer.names),
        "private_variables": private,
        "violated_conjuncts": [
            to_text(conjunct) for conjunct in _top_conjuncts(formulas[compare_side]) if not evaluate(conjunct, assignment)
        ],
        "abduction": {
            "explanation": _literals_to_dict(first),
            "generalizations": [_literals_to_dict(item) for item in coverage.generalizations],
            "coverage": coverage.coverage,
            "uncovered_witness": _model_to_list(coverage.uncovered, explainer.names),
            "minimal": all(item.minimal for item in coverage.generalizations),
        },
        "counterfactual": {
            "status": counterfactual.status,
            "target": counterfactual.target,
            "model": _model_to_list(counterfactual.model, explainer.names),
            "changes": _changes_to_list(counterfactual.changes),
            "alternatives": [_changes_to_list(changes) for changes in counterfactual.alternatives],
            "optimized": counterfactual.optimized,
        },
    }
