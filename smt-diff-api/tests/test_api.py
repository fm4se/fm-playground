import pytest
from smt_diff_api import backend

PREVIOUS = "(declare-const x Int)(assert (> x 0))(assert (< x 5))(check-sat)"
CURRENT = "(declare-const x Int)(assert (> x 3))(check-sat)"


@pytest.fixture(autouse=True)
def no_backend(monkeypatch):
    monkeypatch.setattr(backend, "fetch_scripts", lambda check, p: (PREVIOUS, CURRENT))
    monkeypatch.setattr(backend, "log_to_db", lambda p, result: None)


def test_limits(client):
    limits = client.get("/limits").json()
    assert limits["solver_timeout_ms"]["max"] >= limits["solver_timeout_ms"]["default"]


def test_analyze_raw_scripts(client):
    response = client.post("/analyze", json={"previous": PREVIOUS, "current": CURRENT})
    assert response.status_code == 200
    result = response.json()
    assert result["equivalent"] is False
    pair = result["pairs"][0]
    assert pair["relation"] == "incomparable"
    tightening = pair["tightening"]
    assert tightening["diverged"]
    assert tightening["violated_assertions"][0]["text"] == "(assert (> x 3))"
    assert tightening["abduction"]["coverage"] == "complete"
    assert tightening["counterfactual"]["status"] == "found"


def test_analyze_permalink_and_options(client):
    response = client.post(
        "/analyze",
        json={"check": "SMTSemDiff", "p": "abc", "explain": False, "matching": "positional", "encoding": "selectors", "solver_timeout_ms": 10**9},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["matching"] == "positional" and result["encoding"] == "selectors"
    assert result["pairs"][0]["tightening"]["abduction"] is None
    assert result["limits"]["solver_timeout_ms"] <= 60_000


def test_analyze_errors(client):
    assert client.post("/analyze", json={"previous": PREVIOUS}).status_code == 422
    assert client.post("/analyze", json={"previous": PREVIOUS, "current": CURRENT, "timeout_s": 0}).status_code == 422
    response = client.post("/analyze", json={"previous": PREVIOUS, "current": "(assert"})
    assert response.status_code == 400
    assert response.json()["detail"]["script"] == "current"


def test_witness_iteration(client):
    start = client.post("/witnesses", json={"previous": PREVIOUS, "current": CURRENT, "mode": "tightening"})
    assert start.status_code == 200
    body = start.json()
    assert body["status"] == "sat"
    seen = {body["witness"]["assignments"][0]["value"]}
    while True:
        step = client.get(f"/witnesses/{body['specId']}/next").json()
        if step["status"] != "sat":
            break
        seen.add(step["witness"]["assignments"][0]["value"])
    assert step["status"] == "exhausted"
    assert seen == {"1", "2", "3"}
    assert client.get(f"/witnesses/{body['specId']}/next").status_code == 404


def test_witness_errors(client):
    unsat = client.post("/witnesses", json={"previous": CURRENT, "current": CURRENT, "mode": "tightening"}).json()
    assert unsat["status"] == "unsat" and unsat["specId"] is None
    bad_filter = client.post("/witnesses", json={"previous": PREVIOUS, "current": CURRENT, "mode": "common", "filter": "(assert (> y 0))"})
    assert bad_filter.status_code == 400
    assert client.post("/witnesses", json={"previous": PREVIOUS, "current": CURRENT, "mode": "common", "pair": 3}).status_code == 404


def test_legacy_run_and_next(client):
    run = client.get("/run/", params={"check": "SMTSemDiff", "p": "abc", "analysis": "not-current-but-previous"})
    assert run.status_code == 200
    spec_id = run.json()["specId"]
    assert "define-fun x" in run.json()["witness"]
    assert client.get(f"/next/{spec_id}", params={"p": "abc"}).status_code == 200

    relation = client.get("/run/", params={"check": "SMTSemDiff", "p": "abc", "analysis": "semantic-relation"}).json()
    assert relation["witness"].startswith("Scripts are incomparable")
    assert client.get("/run/", params={"check": "SMTSemDiff", "p": "abc", "analysis": "bogus"}).status_code == 400
    assert client.get("/next/missing", params={"p": "abc"}).status_code == 404
