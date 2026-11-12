"""Single API-worker job manager. Durable artifacts, separate training processes."""

import subprocess
import sys
import threading
import uuid
from pathlib import Path
import numpy as np
from fastapi import APIRouter, HTTPException
from app.rl import storage
from app.rl.config import ExperimentConfig, PPO_SETTINGS
from app.market_data.service import DataSelection, dataset

router = APIRouter(prefix="/api/training", tags=["reinforcement learning"])
lock = threading.Lock()
# Retain process objects so their exit status can be reaped and failures surfaced.
processes = {}


def job_path(job_id):
    try:
        if str(uuid.UUID(job_id)) != job_id:
            raise ValueError()
    except ValueError:
        raise HTTPException(404, "Experiment not found")
    path = storage.ROOT / job_id
    if not (path / "job.json").exists():
        raise HTTPException(404, "Experiment not found")
    return path


def get_job(path):
    job = storage.read(path / "job.json")
    proc = processes.get(job["id"])
    if (
        proc is not None
        and proc.poll() is not None
        and job["status"] in {"queued", "running", "evaluating"}
    ):
        job.update(
            status="failed",
            error=f"Worker exited unexpectedly ({proc.returncode}); inspect worker.log",
            updated_at=storage.now(),
        )
        storage.write(path / "job.json", job)
    return job


def all_jobs():
    if not storage.ROOT.exists():
        return []
    return sorted(
        [get_job(p.parent) for p in storage.ROOT.glob("*/job.json")],
        key=lambda j: j["created_at"],
        reverse=True,
    )


def ensure_idle():
    if any(j["status"] in {"queued", "running", "evaluating"} for j in all_jobs()):
        raise HTTPException(
            409,
            "An experiment is active. Wait for it to finish before starting another operation.",
        )


def launch(path, operation):
    with (path / "worker.log").open("ab") as log:
        proc = subprocess.Popen(
            [sys.executable, "-m", "app.rl.worker", str(path), operation],
            cwd=Path(__file__).resolve().parents[2],
            stdout=log,
            stderr=subprocess.STDOUT,
        )
    processes[path.name] = proc


@router.get("/data")
def data_description(data_source: str = "synthetic", data_range: str = "3Y"):
    from fastapi import HTTPException
    try:
        selection = DataSelection(data_source=data_source, data_range=data_range)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return dataset(selection)[2]


@router.get("/jobs")
def list_jobs():
    return all_jobs()


@router.post("/jobs", status_code=202)
def train(config: ExperimentConfig):
    with lock:
        ensure_idle()
        dates, prices, provenance = dataset(config)
        job_id = str(uuid.uuid4())
        path = storage.ROOT / job_id
        path.mkdir(parents=True)
        np.savez_compressed(path / "dataset.npz", dates=dates, prices=prices)
        job = {
            "id": job_id,
            "status": "queued",
            "created_at": storage.now(),
            "updated_at": storage.now(),
            "config": config.model_dump(),
            "algorithm": {
                "name": "PPO",
                "device": "cpu",
                "policy": "MlpPolicy",
                **PPO_SETTINGS,
            },
            "agent_seeds": {"profit": config.seed, "responsible": config.seed + 1},
            "data": provenance,
            "timesteps_per_agent": config.timesteps,
            "agents": {},
        }
        storage.write(path / "config.json", job["config"])
        storage.write(path / "job.json", job)
        try:
            launch(path, "train")
        except OSError as exc:
            job.update(status="failed", error=str(exc))
            storage.write(path / "job.json", job)
            raise HTTPException(503, "Could not launch training worker")
        return job


@router.get("/jobs/{job_id}")
def status(job_id: str):
    return get_job(job_path(job_id))


@router.post("/jobs/{job_id}/evaluate", status_code=202)
def evaluate(job_id: str):
    with lock:
        path = job_path(job_id)
        job = get_job(path)
        if job["status"] not in {"trained", "completed"}:
            raise HTTPException(409, "Both agents must be trained before evaluation")
        ensure_idle()
        job.update(status="evaluating", updated_at=storage.now())
        storage.write(path / "job.json", job)
        try:
            launch(path, "evaluate")
        except OSError as exc:
            job.update(status="failed", error=str(exc))
            storage.write(path / "job.json", job)
            raise HTTPException(503, "Could not launch evaluation worker")
        return job
