"""POST /explain: explanations of the witness the user is looking at."""

import pytest
from smt_diff_api import backend

PREVIOUS = "(declare-const x Int)(declare-const y Int)(assert (> x 0))(assert (< x 10))(assert (= y 1))"
CURRENT = "(declare-const x Int)(declare-const y Int)(assert (> x 3))(assert (< x 10))(assert (= y 1))"


@pytest.fixture(autouse=True)
def no_backend(monkeypatch):
    monkeypatch.setattr(backend, "fetch_scripts", lambda check, p: (PREVIOUS, CURRENT))
    monkeypatch.setattr(backend, "log_to_db", lambda p, result: None)


def explain(client, **body):
    return client.post("/explain", json={"check": "SMTSemDiff", "p": "abc", **body})


def value(witness, name):
    return next(item["value"] for item in witness["assignments"] if item["name"] == name)


def test_explains_the_displayed_witness(client):
    run = client.get("/run/", params={"check": "SMTSemDiff", "p": "abc", "analysis": "not-current-but-previous", "format": "json"}).json()
    second = client.get(f"/next/{run['specId']}", params={"p": "abc", "format": "json"}).json()
    response = explain(client, mode="tightening", witness=1)
    assert response.status_code == 200
    body = response.json()
    assert body["witness"]["assignments"] == second["witness"]["assignments"]
    assert body["base"] == "previous" and body["compare"] == "current"
    assert [entry["text"] for entry in body["violated_assertions"]] == ["(assert (> x 3))"]

    abduction = body["abduction"]
    assert abduction["coverage"] == "complete"
    assert abduction["explanation"]["literals"] == [{"text": "x <= 3", "smtlib": "(not (> x 3))"}]

    counterfactual = body["counterfactual"]
    assert counterfactual["status"] == "found" and counterfactual["target"] == "both"
    assert counterfactual["changes"] == [{"symbol": "x", "before": value(body["witness"], "x"), "after": "4"}]
    assert value(counterfactual["model"], "y") == "1"


def test_relaxation_swaps_the_roles(client):
    previous = "(declare-const x Int)(assert (> x 3))"
    body = client.post("/explain", json={"previous": previous, "current": "(declare-const x Int)(assert (> x 0))", "mode": "relaxation"}).json()
    assert body["base"] == "current" and body["compare"] == "previous"
    assert body["violated_assertions"][0]["text"] == "(assert (> x 3))"


def test_filter_is_replayed(client):
    body = explain(client, mode="tightening", filter="(assert (= x 2))").json()
    assert value(body["witness"], "x") == "2"


def test_explain_errors(client):
    assert explain(client, mode="tightening", witness=50).json()["detail"]["code"] == "witness_not_found"
    assert explain(client, mode="relaxation").status_code == 404  # CURRENT is stronger: no relaxation
    assert explain(client, mode="common").status_code == 422
    assert explain(client, mode="tightening", filter="(assert (> w 0))").json()["detail"]["code"] == "filter_error"
    bad = client.post("/explain", json={"previous": "(assert", "current": CURRENT, "mode": "tightening"})
    assert bad.status_code == 400 and bad.json()["detail"]["script"] == "previous"


def test_analyze_reports_structured_changes(client):
    pair = client.post("/analyze", json={"previous": PREVIOUS, "current": CURRENT}).json()["pairs"][0]
    changes = pair["tightening"]["counterfactual"]["changes"]
    assert changes and set(changes[0]) == {"symbol", "before", "after"}
    assert pair["tightening"]["abduction"]["generalizations"][0]["literals"]


def test_booleans_are_spelled_as_in_smtlib(client):
    users = "(declare-sort User)(declare-fun is_admin (User) Bool)(declare-const alice User)"
    body = client.post(
        "/explain",
        json={"previous": users + "(assert (is_admin alice))", "current": users + "(assert (not (is_admin alice)))", "mode": "relaxation"},
    ).json()
    changes = {change["symbol"]: change for change in body["counterfactual"]["changes"]}
    assert changes["is_admin(alice)"]["before"] == "false" and changes["is_admin(alice)"]["after"] == "true"
    assert "False" not in str(body["witness"]) and "True" not in str(body["counterfactual"]["model"])
