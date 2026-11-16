"""Public deployment contract; local PPO tests continue to execute real workers."""
import importlib
from fastapi.testclient import TestClient
from app import database
from app.main import app
from app.rl import storage
from app.backtesting import jobs as backtests


def test_public_demo_is_read_only_with_real_sample_exports(tmp_path, monkeypatch):
    monkeypatch.setenv("PUBLIC_DEMO_MODE", "1")
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "demo.db")
    # monkeypatch restores roots after the demo lifespan.
    monkeypatch.setattr(storage, "ROOT", storage.ROOT)
    monkeypatch.setattr(backtests, "ROOT", backtests.ROOT)
    with TestClient(app) as client:
        assert client.get("/api/health").json()["public_demo"] is True
        experiments = client.get("/api/training/jobs").json()
        assert experiments and experiments[0]["status"] == "completed"
        assert experiments[0]["data"]["data_source"] == "synthetic"
        identifier = experiments[0]["id"]
        for url in ("/api/training/jobs", f"/api/training/jobs/{identifier}/evaluate", "/api/backtests"):
            response = client.post(url, json={}, headers={"Origin": "http://localhost:5173"})
            assert response.status_code == 403
            assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
        runs = client.get("/api/backtests").json()
        result = client.get(f"/api/backtests/{runs[0]['id']}").json()["result"]
        assert len(result["results"]) == 6
        for format in ("json", "csv"):
            response = client.get(f"/api/backtests/{runs[0]['id']}/export?format={format}")
            assert response.status_code == 200
            assert "attachment" in response.headers["content-disposition"]
        assert client.get("/api/report").status_code == 200
        assert client.post("/api/simulate", json={"weights": {
            "SPY": .35, "AGG": .25, "GLD": .15, "QQQ": .2, "CASH": .05
        }}).status_code == 200


def test_exact_production_cors(monkeypatch):
    # Reconstruct the app using deployment configuration, then restore module state.
    from app import main
    monkeypatch.setenv("CORS_ORIGINS", "https://verdant-example.vercel.app")
    try:
        deployed = importlib.reload(main).app
        with TestClient(deployed) as client:
            for origin, permitted in (
                ("https://verdant-example.vercel.app", True),
                ("https://untrusted.example", False),
                ("https://verdant-example.vercel.app.evil.example", False),
            ):
                response = client.options("/api/simulate", headers={
                    "Origin": origin, "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                })
                assert (response.status_code == 200) is permitted
                assert ("access-control-allow-origin" in response.headers) is permitted
    finally:
        monkeypatch.delenv("CORS_ORIGINS")
        importlib.reload(main)
