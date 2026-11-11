"""End-to-end tests run real CPU PPO subprocesses, not mocked optimization."""

import time
import numpy as np
import pytest
from fastapi.testclient import TestClient
from app import database
from app.main import app
from app.rl import jobs, storage
from app.rl.config import ExperimentConfig
from app.rl.data import load_data, splits
from app.rl.environment import PortfolioEnv


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "portfolio.db")
    monkeypatch.setattr(storage, "ROOT", tmp_path / "experiments")
    with TestClient(app) as client:
        yield client
    for proc in jobs.processes.values():
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=10)
    jobs.processes.clear()


def wait(client, job_id, expected):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        response = client.get(f"/api/training/jobs/{job_id}")
        assert response.status_code == 200
        job = response.json()
        if job["status"] in {expected, "failed"}:
            assert job["status"] == expected, job.get("error")
            return job
        # While CPU optimization runs, unrelated API requests remain functional.
        assert client.get("/api/health").json()["status"] == "ok"
        time.sleep(0.25)
    pytest.fail("Training/evaluation worker did not finish within 180 seconds")


def test_real_training_and_evaluation(client):
    import torch
    from stable_baselines3 import PPO

    assert client.get("/api/training/jobs").json() == []
    assert client.get("/api/training/data").json()["observations"] == 780
    assert client.get("/api/training/jobs/invalid").status_code == 404
    assert client.post("/api/training/jobs", json={"min_esg": 99}).status_code == 422
    started = client.post("/api/training/jobs", json={"mode": "quick", "seed": 11})
    assert started.status_code == 202
    job_id = started.json()["id"]
    assert client.post("/api/training/jobs", json={}).status_code == 409
    assert client.post(f"/api/training/jobs/{job_id}/evaluate").status_code == 409
    trained = wait(client, job_id, "trained")
    assert "evaluation" not in trained
    path = storage.ROOT / job_id
    assert not (path / "evaluation.json").exists()
    states = {}
    dates, prices = load_data()
    for agent in ["profit", "responsible"]:
        state = trained["agents"][agent]
        assert state["steps"] == 512
        assert [p["steps"] for p in state["curve"]] == [128, 256, 384, 512]
        assert all(np.isfinite(p["mean_training_reward"]) for p in state["curve"])
        assert (path / f"{agent}.zip").stat().st_size > 0
        assert (path / f"{agent}_metrics.json").exists()
        model = PPO.load(path / f"{agent}.zip", device="cpu")
        states[agent] = model.policy.state_dict()
        config = ExperimentConfig(**trained["config"])
        env = PortfolioEnv(
            prices, dates, *splits(len(dates))["train"], config, agent == "responsible"
        )
        initial = PPO(
            "MlpPolicy",
            env,
            device="cpu",
            seed=11 + (agent == "responsible"),
            n_steps=128,
            batch_size=64,
            n_epochs=5,
            policy_kwargs={"net_arch": [32, 32]},
        )
        assert any(
            not torch.equal(v, initial.policy.state_dict()[k])
            for k, v in states[agent].items()
        ), "Saved checkpoint did not learn"
    assert any(
        not torch.equal(v, states["responsible"][k])
        for k, v in states["profit"].items()
    )
    assert client.post(f"/api/training/jobs/{job_id}/evaluate").status_code == 202
    evaluated = wait(client, job_id, "completed")
    for agent, result in evaluated["evaluation"].items():
        assert result["transitions"] == trained["data"]["splits"]["test"]["transitions"]
        assert result["end_date"] == str(dates[-1])
        assert result["total_return"] == pytest.approx(
            (result["history"][-1]["value"] / 100000 - 1) * 100
        )
        assert result["fees"] > 0 and result["slippage"] > 0
        assert result["history"][0]["value"] == 100000
        if agent == "responsible":
            assert result["min_target_esg"] >= 65 - 1e-8
        assert all(
            sum(row["weights"]) == pytest.approx(1) for row in result["history"][1:]
        )
    assert (path / "evaluation.json").exists()
    # Evaluation does not alter selected model bytes.
    before = {a: (path / f"{a}.zip").read_bytes() for a in ["profit", "responsible"]}
    assert client.post(f"/api/training/jobs/{job_id}/evaluate").status_code == 202
    repeated = wait(client, job_id, "completed")
    assert repeated["evaluation"] == evaluated["evaluation"]
    assert all(
        (path / f"{a}.zip").read_bytes() == content for a, content in before.items()
    )


def test_launch_failure_is_recorded(client, monkeypatch):
    def fail(*args):
        raise OSError("test process launch failure")

    monkeypatch.setattr(jobs, "launch", fail)
    assert client.post("/api/training/jobs", json={}).status_code == 503
    job = client.get("/api/training/jobs").json()[0]
    assert job["status"] == "failed"
    assert "test process launch failure" in job["error"]
