from smt_diff_api.analysis import semantic_relation
from smt_diff_api.cache import cache
from smt_diff_api.legacy import colorize_model, get_next_witness, next_step, render_html, render_json, store_witness
from smt_diff_api.witnesses import open_stream

USERS = """
(declare-sort User)
(declare-fun is_admin (User) Bool)
(declare-const Alice User)
(assert (is_admin Alice))
"""
NOT_ADMIN = USERS.replace("(assert (is_admin Alice))", "(assert (not (is_admin Alice)))")


def test_caching_with_declare_sort():
    spec_id = store_witness(USERS, NOT_ADMIN, analysis="not-previous-but-current")
    assert cache.get_info(spec_id) is not None
    witness = get_next_witness(spec_id)
    assert "is_admin" in witness and "Alice" in witness


def test_both_directions():
    assert "false" in get_next_witness(store_witness(USERS, NOT_ADMIN, analysis="not-previous-but-current"))
    assert "true" in get_next_witness(store_witness(USERS, NOT_ADMIN, analysis="not-current-but-previous"))


def test_multiple_witnesses_then_exhausted():
    previous = "(declare-const x Int)(assert (> x 0))(assert (< x 5))"
    current = "(declare-const x Int)(assert (> x 2))(assert (< x 8))"
    spec_id = store_witness(previous, current, analysis="not-current-but-previous")
    witnesses = [get_next_witness(spec_id), get_next_witness(spec_id)]
    assert None not in witnesses and witnesses[0] != witnesses[1]
    assert get_next_witness(spec_id) is None
    assert cache.get_info(spec_id) is None


def test_common_witness():
    previous = "(declare-const x Int)(declare-const y Int)(assert (> x 0))(assert (> y 0))"
    current = "(declare-const x Int)(declare-const y Int)(assert (< x 10))(assert (< y 10))"
    witness = get_next_witness(store_witness(previous, current, analysis="common-witness"))
    assert "define-fun x" in witness and "define-fun y" in witness


def test_no_witness_message():
    script = "(declare-const x Int)(assert (> x 0))"
    assert get_next_witness(store_witness(script, script, analysis="not-current-but-previous")) == "No diff witnesses found (unsat/unknown)."


def test_errors_are_one_shot_messages():
    spec_id = store_witness("(declare-const x Int", "(declare-const y Int)", analysis="not-previous-but-current")
    message = get_next_witness(spec_id)
    assert "color: red" in message and "previous script" in message
    assert get_next_witness(spec_id) is None

    filter_error = get_next_witness(store_witness(USERS, NOT_ADMIN, analysis="common-witness", filter="(assert (> y 0.7))"))
    assert "Error parsing filter" in filter_error

    assert "Unknown analysis type" in get_next_witness(store_witness(USERS, NOT_ADMIN, analysis="other"))


def test_logic_header():
    script = "(set-logic QF_LIA)(declare-const x Int)(assert (> x 0))"
    assert get_next_witness(store_witness(script, script, analysis="common-witness")).startswith("QF_LIA\n")
    other = "(set-logic QF_NIA)(declare-const x Int)(assert (> x 0))"
    assert "Different logics" in get_next_witness(store_witness(script, other, analysis="common-witness"))


def test_colorize_model():
    text = '(\n  (define-fun y () Int\n    1)\n  (define-fun |a b| () String\n    "x)")\n  (define-fun x () Int\n    2)\n)'
    colored = colorize_model(text, previous_only={"y"}, current_only={"a b"})
    assert "<span style='color: red;'>(define-fun y () Int\n    1)</span>" in colored
    assert "<span style='color: green;'>(define-fun |a b| () String\n    \"x)\")</span>" in colored
    assert "<span style='color: ;'>(define-fun x () Int\n    2)</span>" in colored


def test_semantic_relation():
    weak = "(declare-const x Int)(assert (> x 0))"
    strong = "(declare-const x Int)(assert (> x 5))"
    other = "(declare-const x Int)(assert (< x 3))"
    assert semantic_relation(weak, weak, solver_timeout_ms=5000) == "equivalent"
    assert semantic_relation(weak, strong, solver_timeout_ms=5000) == "tightened"
    assert semantic_relation(strong, weak, solver_timeout_ms=5000) == "relaxed"
    assert semantic_relation(weak, other, solver_timeout_ms=5000) == "incomparable"


def test_solver_unknown_in_both_formats():
    stream = open_stream(USERS, NOT_ADMIN, "relaxation")
    stream._models = iter(())
    stream.incomplete, stream.reason_unknown = True, "timeout"
    spec_id = cache.create(stream, kind="legacy", ttl_seconds=60)
    step = next_step(spec_id)
    assert step.status == "unknown"
    assert render_html(step) == "<span style='color: red;'>Solver returned unknown (possibly timed out) (timeout)</span>"
    payload = render_json(spec_id, step)
    assert payload["status"] == "unknown" and payload["reason_unknown"] == "timeout"
    assert payload["specId"] is None and payload["witness"] is None and payload["error"] is None
