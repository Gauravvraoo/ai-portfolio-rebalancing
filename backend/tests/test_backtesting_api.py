import csv
import hashlib
import io
import time
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app import database
from app.main import app
from app.rl import jobs as training, storage
from app.backtesting import jobs


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "portfolio.db")
    monkeypatch.setattr(storage, "ROOT", tmp_path / "experiments")
    monkeypatch.setattr(jobs, "ROOT", tmp_path / "backtests")
    with TestClient(app) as client:
        yield client
    for group in [training.processes, jobs.processes]:
        for process in group.values():
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
        group.clear()


def wait(client, url, expected="completed"):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        response = client.get(url)
        assert response.status_code == 200
        job = response.json()
        if job["status"] in {expected, "failed"}:
            assert job["status"] == expected, job.get("error")
            return job
        assert client.get("/api/health").json()["database"] == "connected"
        time.sleep(0.2)
    pytest.fail("Background operation timed out")


def test_four_benchmarks_and_exports(client):
    assert client.get("/api/backtests").json() == []
    assert client.get("/api/backtests/options").json()["experiments"] == []
    response = client.post(
        "/api/backtests",
        json={
            "initial_capital": 25000,
            "rebalance_frequency": "monthly",
            "apply_esg_to_all": True,
        },
    )
    assert response.status_code == 202
    identifier = response.json()["id"]
    assert client.post("/api/backtests", json={}).status_code == 409
    assert client.get(f"/api/backtests/{identifier}/export").status_code == 409
    job = wait(client, f"/api/backtests/{identifier}")
    result = job["result"]
    assert len(result["results"]) == 4
    assert all(s["history"][0]["value"] == 25000 for s in result["results"])
    json_response = client.get(f"/api/backtests/{identifier}/export?format=json")
    assert json_response.json() == result
    assert "attachment" in json_response.headers["content-disposition"]
    summary = client.get(f"/api/backtests/{identifier}/export?format=csv&kind=summary")
    rows = list(csv.DictReader(io.StringIO(summary.text)))
    assert len(rows) == 4
    assert (
        float(rows[0]["final_value"]) == result["results"][0]["metrics"]["final_value"]
    )
    assert "SYNTHETIC" in rows[0]["data_assumption"]
    history = client.get(f"/api/backtests/{identifier}/export?format=csv&kind=history")
    rows = list(csv.DictReader(io.StringIO(history.text)))
    assert len(rows) == 4 * (result["period"]["returns"] + 1)
    assert float(rows[-1]["value"]) == result["results"][-1]["history"][-1]["value"]
    assert sum(
        float(rows[-1]["weight_" + s]) for s in result["symbols"]
    ) == pytest.approx(1)
    assert client.get(f"/api/backtests/{identifier}").json()["result"] == result
    assert (
        client.get(f"/api/backtests/{identifier}/export?format=xml").status_code == 422
    )


def test_real_six_strategy_comparison_and_ppo_parity(client):
    from stable_baselines3 import PPO
    from app.rl.config import ExperimentConfig
    from app.rl.data import splits
    from app.rl.environment import PortfolioEnv
    from app.rl.worker import evaluate_policy

    response = client.post("/api/training/jobs", json={"mode": "quick", "seed": 23})
    assert response.status_code == 202
    experiment_id = response.json()["id"]
    trained = wait(client, f"/api/training/jobs/{experiment_id}", expected="trained")
    assert len(client.get("/api/backtests/options").json()["experiments"]) == 1
    source = storage.ROOT / experiment_id
    before = {
        agent: hashlib.sha256((source / f"{agent}.zip").read_bytes()).hexdigest()
        for agent in ["profit", "responsible"]
    }
    run = client.post(
        "/api/backtests",
        json={"experiment_id": experiment_id, "rebalance_frequency": "daily"},
    )
    assert run.status_code == 202
    identifier = run.json()["id"]
    completed = wait(client, f"/api/backtests/{identifier}")
    result = completed["result"]
    assert len(result["results"]) == 6
    assert result["model_sha256"] == before
    snapshots = np.load(source / "dataset.npz", allow_pickle=False)
    dates, prices = snapshots["dates"], snapshots["prices"]
    for agent in ["profit", "responsible"]:
        reference = evaluate_policy(
            PPO.load(source / f"{agent}.zip", device="cpu"),
            PortfolioEnv(
                prices,
                dates,
                *splits(len(dates))["test"],
                ExperimentConfig(**trained["config"]),
                agent == "responsible",
            ),
        )
        strategy = next(s for s in result["results"] if s["id"] == agent)
        np.testing.assert_allclose(
            [p["value"] for p in strategy["history"]],
            [p["value"] for p in reference["history"]],
            rtol=1e-12,
        )
        assert strategy["metrics"]["fees"] == pytest.approx(reference["fees"])
        assert strategy["metrics"]["cumulative_return"] == pytest.approx(
            reference["total_return"]
        )
        assert (
            hashlib.sha256((source / f"{agent}.zip").read_bytes()).hexdigest()
            == before[agent]
        )
    intervals = {tuple(p["date"] for p in s["history"]) for s in result["results"]}
    assert len(intervals) == 1
    assert (
        result["period"]["returns"] == trained["data"]["splits"]["test"]["transitions"]
    )
    # Selection and replay use saved training data, even when the default fixture differs.
    with np.load(source / "dataset.npz", allow_pickle=False) as data:
        modified = data["prices"].copy()
        modified[-1, 0] *= 2
        dates = data["dates"].copy()
    np.savez_compressed(source / "dataset.npz", dates=dates, prices=modified)
    rejected = client.post("/api/backtests", json={"experiment_id": experiment_id})
    assert rejected.status_code == 409
    assert "checksum" in rejected.json()["detail"]


@pytest.mark.parametrize(
    "payload",
    [
        {"min_esg": 99},
        {"start_date": "2022-06-01"},
        {"end_date": "2023-01-02"},
        {"fee_bps": -1},
        {"initial_capital": 0},
        {"experiment_id": "bad"},
        {"lookback": 200},
    ],
)
def test_invalid_backtest_requests(client, payload):
    assert client.post("/api/backtests", json=payload).status_code == 422
    assert client.get("/api/backtests").json() == []


def test_missing_ids_and_worker_launch_error(client, monkeypatch):
    assert client.get("/api/backtests/not-an-id").status_code == 404
    assert (
        client.post(
            "/api/backtests",
            json={"experiment_id": "00000000-0000-0000-0000-000000000000"},
        ).status_code
        == 404
    )

    def fail(*args, **kwargs):
        raise OSError("deliberate backtest launch error")

    monkeypatch.setattr(jobs.subprocess, "Popen", fail)
    assert client.post("/api/backtests", json={}).status_code == 503
    failed = client.get("/api/backtests").json()[0]
    assert failed["status"] == "failed"
    assert "launch error" in failed["error"]
