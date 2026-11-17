import itertools
import random
import pytest

from limboole_diff.explainer import DiffExplainer, WitnessError, explain_witness
from limboole_diff.parser import evaluate, parse

from .test_parser import random_formula

NAMES = ["a", "b", "c", "d", "e"]


def assignments(names: list[str]):
    for values in itertools.product([False, True], repeat=len(names)):
        yield dict(zip(names, values))


def holds(literals, assignment) -> bool:
    return all(assignment[literal.name] == literal.value for literal in literals)


def random_pairs(seed: int, count: int):
    rng = random.Random(seed)
    produced = 0
    while produced < count:
        base, compare = random_formula(rng, NAMES, 3), random_formula(rng, NAMES, 3)
        explainer = DiffExplainer(base, compare)
        witnesses = [w for w in assignments(explainer.names) if evaluate(base, w) and not evaluate(compare, w)]
        if witnesses:
            produced += 1
            yield explainer, witnesses


def test_abduction_is_sound_and_subset_minimal() -> None:
    for explainer, witnesses in random_pairs(1, 40):
        witness = witnesses[0]
        result = explainer.abduce(witness)
        assert result.minimal
        assert holds(result.literals, witness)

        def entails(literals) -> bool:
            return not any(
                evaluate(explainer.base, w) and evaluate(explainer.compare, w) and holds(literals, w)
                for w in assignments(explainer.names)
            )

        assert entails(result.literals)
        for index in range(len(result.literals)):
            assert not entails(result.literals[:index] + result.literals[index + 1:])


def test_complete_coverage_characterizes_the_region() -> None:
    for explainer, witnesses in random_pairs(2, 40):
        coverage = explainer.cover(witnesses[0])
        assert coverage.coverage == "complete"
        for w in assignments(explainer.names):
            in_region = evaluate(explainer.base, w) and not evaluate(explainer.compare, w)
            covered = evaluate(explainer.base, w) and any(holds(g.literals, w) for g in coverage.generalizations)
            assert in_region == covered


def test_coverage_limit() -> None:
    # x /\ not (a /\ b) has two prime implicants relative to x: !a and !b.
    explainer = DiffExplainer(parse("x"), parse("a & b"))
    witness = {"x": True, "a": False, "b": False}
    limited = explainer.cover(witness, max_generalizations=1)
    assert limited.coverage == "limit-reached"
    assert len(limited.generalizations) == 1
    assert limited.uncovered is not None and not holds(limited.generalizations[0].literals, limited.uncovered)
    full = explainer.cover(witness)
    assert full.coverage == "complete"
    assert sorted(str(g.literals[0]) for g in full.generalizations) == ["!a", "!b"]


def test_counterfactual_is_optimal() -> None:
    for explainer, witnesses in random_pairs(3, 40):
        witness = witnesses[-1]
        result = explainer.counterfactual(witness)
        both = [w for w in assignments(explainer.names) if evaluate(explainer.base, w) and evaluate(explainer.compare, w)]
        compare = [w for w in assignments(explainer.names) if evaluate(explainer.compare, w)]
        targets = both or compare
        if not targets:
            assert result.status == "none"
            continue
        assert result.status == "found"
        assert result.target == ("both" if both else "compare")
        assert result.model in targets
        distance = min(sum(w[n] != witness[n] for n in explainer.names) for w in targets)
        assert len(result.changes) == distance
        flip_sets = [frozenset(c.symbol for c in result.changes)]
        for alternative in result.alternatives:
            assert len(alternative) == distance
            flipped = dict(witness)
            for change in alternative:
                flipped[change.symbol] = change.after
            assert flipped in targets
            flip_sets.append(frozenset(c.symbol for c in alternative))
        assert len(set(flip_sets)) == len(flip_sets)


def test_abductive_and_contrastive_explanations_are_hitting_set_duals() -> None:
    # Every abductive explanation shares a variable with every minimal correction set.
    for explainer, witnesses in random_pairs(4, 20):
        witness = witnesses[0]
        axp = {literal.name for literal in explainer.abduce(witness).literals}
        result = explainer.counterfactual(witness, max_alternatives=10)
        if result.target != "both":
            continue
        for changes in (result.changes, *result.alternatives):
            assert axp & {change.symbol for change in changes}


def test_disjoint_formulas_have_the_empty_explanation() -> None:
    explainer = DiffExplainer(parse("a & b"), parse("!a"))
    result = explainer.abduce({"a": True, "b": True})
    assert result.literals == ()
    counterfactual = explainer.counterfactual({"a": True, "b": True})
    assert counterfactual.target == "compare" and [c.symbol for c in counterfactual.changes] == ["a"]


def test_check_witness() -> None:
    explainer = DiffExplainer(parse("a"), parse("b"))
    explainer.check_witness({"a": True, "b": False})
    with pytest.raises(WitnessError):
        explainer.check_witness({"a": True})
    with pytest.raises(WitnessError):
        explainer.check_witness({"a": True, "b": True})
    with pytest.raises(WitnessError):
        explainer.check_witness({"a": True, "b": False, "z": True})


def test_explain_witness_payload() -> None:
    previous = "(a -> b) & (c | d)"
    current = "(a -> b) & c & (e -> !a)"
    witness = {"a": True, "b": True, "c": False, "d": True, "e": False}
    result = explain_witness(previous, current, "not-current-but-previous", witness)
    assert result["base"] == "previous" and result["compare"] == "current"
    assert result["violated_conjuncts"] == ["c"]
    assert result["abduction"]["explanation"]["text"] == "!c"
    assert {g["text"] for g in result["abduction"]["generalizations"]} == {"!c", "a & e"}
    assert result["abduction"]["coverage"] == "complete"
    assert result["counterfactual"]["changes"] == [{"symbol": "c", "before": 0, "after": 1}]
    assert result["private_variables"] == {"previous": ["d"], "current": ["e"]}


def test_explain_witness_errors() -> None:
    assert explain_witness("a &", "a", "not-current-but-previous", {"a": True})["error"]["script"] == "previous"
    assert explain_witness("a", "b", "not-current-but-previous", {"a": True, "b": True})["error"]["code"] == "invalid_witness"
    assert explain_witness("a", "b", "common-witness", {"a": True, "b": True})["error"]["code"] == "invalid_mode"
