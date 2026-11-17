import json

import pytest

import main

PREVIOUS = "(a -> b) & (c | d)"
CURRENT = "(a -> b) & c & (e -> !a)"


@pytest.fixture
def backend(monkeypatch):
    monkeypatch.setattr(main, "get_code_by_permalink", lambda check, p: CURRENT)
    monkeypatch.setattr(
        main, "get_metadata_by_permalink", lambda check, p: json.dumps({"meta": {"leftSideCodeId": 1}})
    )
    monkeypatch.setattr(main, "get_code_by_id", lambda code_id: {"code": PREVIOUS})
    monkeypatch.setattr(main, "log_to_db", lambda p, result: None)


def test_run_returns_assignment(client, backend) -> None:
    response = client.get("/run/", params={"check": "SATSemDiff", "p": "x", "analysis": "not-current-but-previous"})
    assert response.status_code == 200
    body = response.json()
    assignment = body["assignment"]
    assert set(assignment) == {"a", "b", "c", "d", "e"}
    assert assignment["c"] is False


def test_explain_round_trip(client, backend) -> None:
    run = client.get("/run/", params={"check": "SATSemDiff", "p": "x", "analysis": "not-current-but-previous"}).json()
    response = client.post(
        "/explain",
        json={"check": "SATSemDiff", "p": "x", "analysis": "not-current-but-previous", "assignment": run["assignment"]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["base"] == "previous"
    assert body["abduction"]["coverage"] == "complete"
    assert {g["text"] for g in body["abduction"]["generalizations"]} == {"!c", "a & e"}
    assert body["counterfactual"]["status"] == "found"


def test_explain_rejects_non_witness(client, backend) -> None:
    response = client.post(
        "/explain",
        json={
            "check": "SATSemDiff",
            "p": "x",
            "analysis": "not-current-but-previous",
            "assignment": {"a": True, "b": True, "c": True, "d": True, "e": False},
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_witness"
