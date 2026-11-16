import pytest
from smt_diff import ScriptError
from smt_diff_api.witnesses import FilterError, InvalidPair, open_stream
from z3 import is_true

PREVIOUS = """
(declare-const x Int)
(assert (> x 0))
(assert (< x 5))
"""
CURRENT = """
(declare-const x Int)
(assert (> x 3))
"""


def values(stream, name, limit=10):
    found = []
    while len(found) < limit and (model := stream.next()) is not None:
        found.append(next(model[d] for d in model.decls() if d.name() == name).as_long())
    return found


def test_tightening_enumerates_all_distinct_witnesses():
    stream = open_stream(PREVIOUS, CURRENT, "tightening")
    assert sorted(values(stream, "x")) == [1, 2, 3]
    assert stream.status == "sat"
    assert not stream.incomplete


def test_relaxation_and_common_regions():
    relaxation = open_stream(PREVIOUS, CURRENT, "relaxation")
    assert all(value >= 5 for value in values(relaxation, "x", limit=3))
    common = open_stream(PREVIOUS, CURRENT, "common")
    assert values(common, "x") == [4]


def test_no_witness_reports_unsat():
    stream = open_stream(CURRENT, CURRENT, "tightening")
    assert stream.next() is None
    assert stream.status == "unsat"


def test_filter_restricts_region():
    stream = open_stream(PREVIOUS, CURRENT, "tightening", filter="(assert (> x 2))")
    assert values(stream, "x") == [3]


def test_filter_with_unknown_symbol_is_rejected():
    with pytest.raises(FilterError):
        open_stream(PREVIOUS, CURRENT, "tightening", filter="(assert (> y 0))")


def test_filter_over_datatype_constructors():
    script = "(declare-datatypes () ((S A B C)))(declare-const x S)"
    stream = open_stream(script + "(assert (not (= x C)))", script + "(assert (= x C))", "tightening", filter="(assert (= x B))")
    model = stream.next()
    assert "B" in model.sexpr()
    assert stream.next() is None


def test_uninterpreted_sorts_and_functions():
    previous = """
    (declare-sort User)
    (declare-fun is_admin (User) Bool)
    (declare-const Alice User)
    (assert (is_admin Alice))
    """
    current = previous.replace("(assert (is_admin Alice))", "(assert (not (is_admin Alice)))")
    stream = open_stream(previous, current, "relaxation")
    model = stream.next()
    assert "is_admin" in model.sexpr() and "Alice" in model.sexpr()
    alice = stream.symbols_b.constants["Alice"]
    is_admin = stream.symbols_b.functions["is_admin"]
    assert not is_true(model.eval(is_admin(alice)))


def test_symbols_by_version():
    previous = "(declare-const x Int)(declare-const y Int)(assert (> y x))"
    current = "(declare-const x Int)(declare-const z Int)(assert (> z x))"
    stream = open_stream(previous, current, "tightening")
    assert stream.previous_only == {"y"}
    assert stream.current_only == {"z"}


def test_last_query_is_used_by_default():
    previous = "(declare-const x Int)(push 1)(assert (> x 100))(check-sat)(pop 1)(assert (> x 0))(check-sat)"
    current = "(declare-const x Int)(assert (> x 1))(check-sat)"
    stream = open_stream(previous, current, "tightening")
    assert values(stream, "x") == [1]


def test_pair_index_selects_matched_query():
    previous = "(declare-const x Int)(assert (> x 0))(check-sat)(assert (< x 10))(check-sat)"
    current = "(declare-const x Int)(assert (> x 1))(check-sat)(assert (< x 5))(check-sat)"
    assert values(open_stream(previous, current, "tightening", pair=0), "x") == [1]
    assert sorted(values(open_stream(previous, current, "tightening", pair=1), "x")) == [1, 5, 6, 7, 8, 9]
    with pytest.raises(InvalidPair):
        open_stream(previous, current, "tightening", pair=2)


def test_ill_formed_script_names_its_version():
    with pytest.raises(ScriptError) as error:
        open_stream(PREVIOUS, "(declare-const x Int", "tightening")
    assert error.value.version == "B"


def test_unknown_mode():
    with pytest.raises(ValueError):
        open_stream(PREVIOUS, CURRENT, "sideways")
