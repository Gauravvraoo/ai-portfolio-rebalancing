"""Run as a separate CPU process; no optimization occurs in an HTTP handler."""

import sys
import traceback
import importlib.metadata
from pathlib import Path
import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from app.rl.config import ExperimentConfig, PPO_SETTINGS
from app.rl.data import splits, manifest
from app.rl.environment import PortfolioEnv
from app.rl.storage import read, write, now


def evaluate_policy(model, env):
    obs, initial = env.reset()
    history = [
        {
            **initial,
            "drawdown": 0.0,
            "reward": 0.0,
            "fees": 0.0,
            "slippage": 0.0,
            "turnover": 0.0,
        }
    ]
    done = False
    while not done:
        action, _ = model.predict(obs, deterministic=True)
        obs, _, done, _, info = env.step(action)
        history.append(info)
    returns = np.array([p["net_return"] for p in history[1:]])
    vol = float(returns.std(ddof=1) * np.sqrt(252))
    return {
        "history": history,
        "total_return": (history[-1]["value"] / 100000 - 1) * 100,
        "annualized_volatility": vol * 100,
        "sharpe_zero_rate": float(returns.mean() * 252 / vol) if vol > 1e-12 else None,
        "max_drawdown": -max(p["drawdown"] for p in history) * 100,
        "fees": sum(p["fees"] for p in history),
        "slippage": sum(p["slippage"] for p in history),
        "turnover": sum(p["turnover"] for p in history),
        "mean_esg": float(np.mean([p["esg"] for p in history[1:]])),
        "min_target_esg": min(p["esg"] for p in history[1:]),
        "start_date": history[0]["date"],
        "end_date": history[-1]["date"],
        "transitions": len(returns),
    }


def run(path, operation):
    path = Path(path)
    job = read(path / "job.json")
    config = ExperimentConfig(**job["config"])
    dataset = np.load(path / "dataset.npz", allow_pickle=False)
    prices, dates = dataset["prices"], dataset["dates"]
    if manifest(dates, prices)["sha256"] != job["data"]["sha256"]:
        raise ValueError("Experiment dataset checksum mismatch")
    intervals = splits(len(dates))
    torch.set_num_threads(1)
    job.update(
        status="running" if operation == "train" else "evaluating", updated_at=now()
    )
    write(path / "job.json", job)

    def env(split, responsible):
        start, end = intervals[split]
        return PortfolioEnv(
            prices[: end + 1], dates[: end + 1], start, end, config, responsible
        )

    if operation == "evaluate":
        results = {}
        for agent, responsible in [("profit", False), ("responsible", True)]:
            model = PPO.load(path / f"{agent}.zip", device="cpu")
            results[agent] = evaluate_policy(model, env("test", responsible))
        write(path / "evaluation.json", results)
        job.update(
            evaluation=results, status="completed", evaluated_at=now(), updated_at=now()
        )
        write(path / "job.json", job)
        return

    job["agents"] = {}
    for agent, responsible in [("profit", False), ("responsible", True)]:
        job["active_agent"] = agent
        job["agents"][agent] = {"steps": 0, "curve": [], "status": "running"}
        state = job["agents"][agent]
        write(path / "job.json", job)
        best_score = -float("inf")
        validation_env = env("validation", responsible)

        class Progress(BaseCallback):
            def __init__(self):
                super().__init__()
                self.rewards = []

            def checkpoint(self):
                nonlocal best_score
                if not self.rewards:
                    return
                # Called after PPO has optimized the preceding rollout.
                validation = evaluate_policy(self.model, validation_env)
                row = {
                    "steps": self.num_timesteps,
                    "mean_training_reward": float(np.mean(self.rewards)),
                    "validation_return": validation["total_return"],
                }
                self.rewards = []
                state["curve"].append(row)
                state["steps"] = self.num_timesteps
                score = sum(p["reward"] for p in validation["history"])
                if score > best_score:
                    best_score = score
                    self.model.save(path / f"{agent}.zip")
                    state["selected_at_step"] = self.num_timesteps
                    state["validation"] = validation
                job["updated_at"] = now()
                write(path / "job.json", job)

            def _on_rollout_start(self):
                self.checkpoint()

            def _on_step(self):
                self.rewards.append(float(self.locals["rewards"][0]))
                return True

            def _on_training_end(self):
                self.checkpoint()

        model = PPO(
            "MlpPolicy",
            env("train", responsible),
            device="cpu",
            seed=config.seed + (1 if responsible else 0),
            **PPO_SETTINGS,
            verbose=0,
        )
        model.learn(total_timesteps=config.timesteps, callback=Progress())
        model.save(path / f"{agent}_final.zip")
        state["status"] = "trained"
        write(path / f"{agent}_metrics.json", state)
    job.update(
        status="trained",
        active_agent=None,
        updated_at=now(),
        versions={
            p: importlib.metadata.version(p)
            for p in ["stable-baselines3", "gymnasium", "torch", "numpy"]
        },
    )
    write(path / "job.json", job)


if __name__ == "__main__":
    path = Path(sys.argv[1])
    try:
        run(path, sys.argv[2])
    except Exception as exc:
        traceback.print_exc()
        job = read(path / "job.json")
        job.update(status="failed", error=str(exc), updated_at=now())
        write(path / "job.json", job)
        sys.exit(1)
