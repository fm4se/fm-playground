from fastapi.testclient import TestClient


def test_run_nuxmv(client: TestClient):
    response = client.get("/xmv/run/?check=XMV&p=1")
    assert response.status_code == 404
    assert response.json() == {"detail": "Permalink not found"}
