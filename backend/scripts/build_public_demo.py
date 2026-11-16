"""Explicit maintainer command: compute authentic synthetic demo artifacts locally.

Never runs at API startup or on Render. Uses isolated temporary storage; does not
touch existing local experiments, backtests, prices or checkpoints.
"""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def main():
    destination = BACKEND / "demo"
    if destination.exists():
        raise SystemExit("backend/demo already exists; archive it before regenerating.")
    with tempfile.TemporaryDirectory(prefix="verdant-demo-") as temp:
        root = Path(temp)
        os.environ.update(
            PUBLIC_DEMO_MODE="0",
            PORTFOLIO_DB_PATH=str(root / "portfolio.db"),
            PORTFOLIO_EXPERIMENT_DIR=str(root / "experiments"),
            PORTFOLIO_BACKTEST_DIR=str(root / "backtests"),
        )
        from fastapi.testclient import TestClient
        from app.main import app

        def wait(client, url, expected):
            deadline = time.monotonic() + 300
            while time.monotonic() < deadline:
                response = client.get(url)
                response.raise_for_status()
                job = response.json()
                if job["status"] == "failed":
                    raise RuntimeError(job.get("error"))
                if job["status"] == expected:
                    return job
                time.sleep(0.2)
            raise RuntimeError("Demo computation timed out")

        with TestClient(app) as client:
            started = client.post("/api/training/jobs", json={"mode": "quick", "seed": 7})
            started.raise_for_status()
            identifier = started.json()["id"]
            url = f"/api/training/jobs/{identifier}"
            wait(client, url, "trained")
            client.post(url + "/evaluate").raise_for_status()
            wait(client, url, "completed")
            started = client.post("/api/backtests", json={"experiment_id": identifier})
            started.raise_for_status()
            wait(client, "/api/backtests/" + started.json()["id"], "completed")
        for name in ("experiments", "backtests"):
            shutil.copytree(root / name, destination / name,
                            ignore=shutil.ignore_patterns("worker.log", "*_final.zip"))
        (destination / "provenance.json").write_text(json.dumps({
            "label": "Precomputed synthetic sample; not a live hosted training run",
            "command": "python scripts/build_public_demo.py (from backend)",
            "seed": 7, "timesteps_per_agent": 512,
            "notes": "Genuine local CPU PPO optimization, held-out evaluation and six-strategy replay. Illustrative ESG; no investment-performance claim."
        }, indent=2) + "\n")
        print(destination)


if __name__ == "__main__":
    main()
