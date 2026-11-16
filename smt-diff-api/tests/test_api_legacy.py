"""The legacy /run and /next endpoints in both output formats."""

import pytest
from smt_diff_api import backend

PREVIOUS = "(set-logic QF_LIA)(declare-const x Int)(declare-const y Int)(assert (> x 0))(assert (< x 3))(assert (= y x))"
CURRENT = "(set-logic QF_LIA)(declare-const x Int)(declare-const z Int)(assert (> x 1))(assert (= z x))"


@pytest.fixture
def scripts(monkeypatch):
    pair = {"previous": PREVIOUS, "current": CURRENT}
    monkeypatch.setattr(backend, "fetch_scripts", lambda check, p: (pair["previous"], pair["current"]))
    monkeypatch.setattr(backend, "log_to_db", lambda p, result: None)
    return pair


def run(client, analysis, **params):
    return client.get("/run/", params={"check": "SMTSemDiff", "p": "abc", "analysis": analysis, **params})


def test_html_is_the_default(client, scripts):
    body = run(client, "not-current-but-previous").json()
    assert set(body) == {"specId", "witness"}
    assert body["witness"].startswith("QF_LIA\n")
    assert "<span style='color: red;'>(define-fun y" in body["witness"]
    # x ranges over {1, 2} (z differs from x when x = 2); then the enumeration ends with a 404
    assert "define-fun x" in client.get(f"/next/{body['specId']}", params={"p": "abc"}).json()["witness"]
    assert client.get(f"/next/{body['specId']}", params={"p": "abc"}).status_code == 404


def test_json_witness_and_iteration(client, scripts):
    body = run(client, "not-current-but-previous", format="json").json()
    assert body["status"] == "sat" and body["analysis"] == "not-current-but-previous" and body["error"] is None
    assert body["logic"] == {"previous": "QF_LIA", "current": "QF_LIA"}
    sides = {item["name"]: item["side"] for item in body["witness"]["assignments"]}
    assert sides == {"x": "shared", "y": "previous", "z": "current"}
    assert body["witness"]["text"].startswith("[")

    second = client.get(f"/next/{body['specId']}", params={"p": "abc", "format": "json"}).json()
    assert second["status"] == "sat"
    x_values = {item["value"] for step in (body, second) for item in step["witness"]["assignments"] if item["name"] == "x"}
    assert x_values == {"1", "2"}

    end = client.get(f"/next/{body['specId']}", params={"p": "abc", "format": "json"})
    assert end.status_code == 200
    assert end.json() | {"logic": None} == {
        "specId": None, "status": "exhausted", "reason_unknown": "", "witness": None, "logic": None, "error": None,
    }
    missing = client.get(f"/next/{body['specId']}", params={"p": "abc", "format": "json"})
    assert missing.status_code == 404 and missing.json()["detail"]["code"] == "not_found"


def test_json_multiple_witnesses(client, scripts):
    body = run(client, "not-previous-but-current", format="json").json()
    values = {body["witness"]["assignments"][0]["value"]}
    for _ in range(2):
        step = client.get(f"/next/{body['specId']}", params={"p": "abc", "format": "json"}).json()
        assert step["status"] == "sat" and step["specId"] == body["specId"]
        values.add(step["witness"]["assignments"][0]["value"])
    assert len(values) == 3


def test_no_witnesses(client, scripts):
    scripts["current"] = PREVIOUS
    assert run(client, "not-current-but-previous").json()["witness"] == "No diff witnesses found (unsat/unknown)."
    body = run(client, "not-current-but-previous", format="json").json()
    assert body["status"] == "unsat" and body["specId"] is None and body["witness"] is None


@pytest.mark.parametrize("fmt", ["html", "json"])
def test_parse_error(client, scripts, fmt):
    scripts["current"] = "(assert (> x"
    response = run(client, "common-witness", format=fmt)
    if fmt == "html":
        assert response.status_code == 200
        assert "Error parsing current script" in response.json()["witness"]
    else:
        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["code"] == "parse_error" and detail["script"] == "current"
        assert "<" not in detail["message"]


@pytest.mark.parametrize("fmt", ["html", "json"])
def test_filter_error(client, scripts, fmt):
    response = run(client, "common-witness", format=fmt, filter="(assert (> w 0))")
    if fmt == "html":
        assert "Error parsing filter" in response.json()["witness"]
    else:
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "filter_error"


def test_filter_in_json(client, scripts):
    body = run(client, "not-previous-but-current", format="json", filter="(assert (= x 7))").json()
    x = next(item for item in body["witness"]["assignments"] if item["name"] == "x")
    assert x == {"name": "x", "arity": 0, "value": "7", "side": "shared", "smtlib": "(define-fun x () Int\n  7)"}
    assert x["smtlib"] in body["witness"]["smtlib"]


@pytest.mark.parametrize("fmt", ["html", "json"])
def test_invalid_analysis(client, scripts, fmt):
    response = run(client, "bogus", format=fmt)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_analysis" if fmt == "json" else detail.startswith("Invalid mode")


def test_invalid_format(client, scripts):
    assert run(client, "common-witness", format="xml").status_code == 422


@pytest.mark.parametrize(
    "previous, current, relation, text",
    [
        (PREVIOUS, PREVIOUS, "equivalent", "Current ≡ Previous"),
        ("(declare-const x Int)(assert (> x 0))", "(declare-const x Int)(assert (> x 5))", "tightened", "Current ⊨ Previous"),
        ("(declare-const x Int)(assert (> x 5))", "(declare-const x Int)(assert (> x 0))", "relaxed", "Previous ⊨ Current"),
        (PREVIOUS, CURRENT, "incomparable", "Scripts are incomparable"),
    ],
)
def test_semantic_relation_formats(client, scripts, previous, current, relation, text):
    scripts.update(previous=previous, current=current)
    html = run(client, "semantic-relation").json()
    assert html["specId"] == "semantic-relation" and html["witness"].startswith(text)
    body = run(client, "semantic-relation", format="json").json()
    assert body["relation"] == relation and body["message"].startswith(text)


def test_semantic_relation_parse_error(client, scripts):
    scripts["previous"] = "(assert"
    assert "Error computing semantic relation" in run(client, "semantic-relation").json()["witness"]
    response = run(client, "semantic-relation", format="json")
    assert response.status_code == 400
    assert response.json()["detail"]["script"] == "previous"
