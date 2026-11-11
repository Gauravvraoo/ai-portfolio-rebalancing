"""Background historical replay worker; only loads trusted local saved models."""

import hashlib
import importlib.metadata
from pathlib import Path
import sys
import traceback
import numpy as np
from app.rl.storage import read, write, now
from app.rl.data import manifest
from app.backtesting.config import BacktestConfig
from app.backtesting.engine import backtest


def run(path):
    path = Path(path)
    job = read(path / "job.json")
    job.update(status="running", updated_at=now())
    write(path / "job.json", job)
    with np.load(path / "dataset.npz", allow_pickle=False) as dataset:
        dates, prices = dataset["dates"].copy(), dataset["prices"].copy()
    if manifest(dates, prices)["sha256"] != job["data"]["sha256"]:
        raise ValueError("Backtest dataset checksum mismatch")
    models = {}
    if job["model_sha256"]:
        import torch
        from stable_baselines3 import PPO

        torch.set_num_threads(1)
        for agent, expected in job["model_sha256"].items():
            file = path / f"{agent}.zip"
            if hashlib.sha256(file.read_bytes()).hexdigest() != expected:
                raise ValueError("Model checksum mismatch")
            models[agent] = PPO.load(file, device="cpu")
    result = backtest(
        dates, prices, BacktestConfig(**job["config"]), job["training_config"], models
    )
    result.update(
        id=job["id"],
        created_at=job["created_at"],
        model_sha256=job["model_sha256"],
        training_config=job["training_config"],
        versions={
            p: importlib.metadata.version(p)
            for p in ["numpy", "scipy", "gymnasium", "stable-baselines3"]
        },
    )
    write(path / "result.json", result)
    job.update(status="completed", updated_at=now())
    write(path / "job.json", job)


if __name__ == "__main__":
    path = Path(sys.argv[1])
    try:
        run(path)
    except Exception as exc:
        traceback.print_exc()
        job = read(path / "job.json")
        job.update(status="failed", error=str(exc), updated_at=now())
        write(path / "job.json", job)
        sys.exit(1)
