"""Durable local research backtests, computed in a separate CPU process."""

import csv
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import uuid
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from app.rl import jobs as training_jobs
from app.rl.config import ExperimentConfig
from app.rl.data import manifest, ESG, load_data, SYMBOLS
from app.market_data.service import dataset, source_of
from app.rl.constraints import Constraints
from app.rl.storage import now, read, write
from app.backtesting.config import BacktestConfig
from app.backtesting.engine import interval
from app.backtesting.metrics import METRICS

ROOT = Path(
    os.getenv(
        "PORTFOLIO_BACKTEST_DIR", str(Path(__file__).resolve().parents[2] / "backtests")
    )
)
router = APIRouter(prefix="/api/backtests", tags=["backtesting"])
lock = threading.RLock()
processes = {}


def path_for(identifier):
    try:
        if str(uuid.UUID(identifier)) != identifier:
            raise ValueError()
    except ValueError:
        raise HTTPException(404, "Backtest not found")
    path = ROOT / identifier
    if not (path / "job.json").exists():
        raise HTTPException(404, "Backtest not found")
    return path


def status(path):
    with lock:
        job = read(path / "job.json")
        proc = processes.get(path.name)
        if (
            proc is not None
            and proc.poll() is not None
            and job["status"] in {"queued", "running"}
        ):
            job.update(
                status="failed",
                error=f"Backtest process exited unexpectedly ({proc.returncode}); inspect worker.log",
                updated_at=now(),
            )
            write(path / "job.json", job)
        return job


def summaries():
    return sorted(
        [status(p.parent) for p in ROOT.glob("*/job.json")],
        key=lambda j: j["created_at"],
        reverse=True,
    )


@router.get("/options")
def options():
    dates, prices = load_data()
    return {
        "data": manifest(dates, prices),
        "experiments": [
            {
                "id": j["id"],
                "created_at": j["created_at"],
                "mode": j["config"]["mode"],
                "config": j["config"],
                "data": j["data"],
            }
            for j in training_jobs.all_jobs()
            if j["status"] in {"trained", "completed"}
            and all(
                (training_jobs.job_path(j["id"]) / f"{agent}.zip").exists()
                for agent in ["profit", "responsible"]
            )
        ],
    }


def prepare(config):
    source = None
    training_config = None
    if config.experiment_id:
        source = training_jobs.job_path(str(config.experiment_id))
        job = training_jobs.get_job(source)
        if job["status"] not in {"trained", "completed"}:
            raise HTTPException(
                409, "Select a completed training experiment with both saved PPO models"
            )
        if not all((source / f"{a}.zip").exists() for a in ["profit", "responsible"]):
            raise HTTPException(409, "Selected experiment is missing a model artifact")
        if not (source / "dataset.npz").exists():
            raise HTTPException(
                409, "Selected experiment is missing its immutable dataset snapshot"
            )
        with np.load(source / "dataset.npz", allow_pickle=False) as data:
            dates, prices = data["dates"].copy(), data["prices"].copy()
        if manifest(dates, prices)["sha256"] != job["data"]["sha256"]:
            raise HTTPException(
                409,
                "Selected experiment dataset checksum differs from training; comparison rejected",
            )
        provenance = job["data"]
        if provenance.get("symbols") != list(SYMBOLS):
            raise HTTPException(409, "Experiment asset universe is incompatible with this application")
        if source_of(provenance) != config.data_source:
            raise HTTPException(409, "Dataset source mismatch: select an experiment trained on the selected source")
        if config.data_source == "real" and provenance.get("data_range") != config.data_range:
            raise HTTPException(409, "Dataset range mismatch: use the experiment's original range and immutable snapshot")
        training_config = job["config"]
    else:
        dates, prices, provenance = dataset(config)
    try:
        settings = dict(training_config or {})
        settings["min_esg"] = config.min_esg
        validated = ExperimentConfig(**settings)
        Constraints(validated.min_weights, validated.max_weights, ESG, config.min_esg)
        interval(dates, config)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return dates, prices, training_config, source, provenance


@router.post("", status_code=202)
def create(config: BacktestConfig):
    with lock:
        if any(j["status"] in {"queued", "running"} for j in summaries()):
            raise HTTPException(409, "A backtest is active; wait for completion")
        dates, prices, training_config, source, provenance = prepare(config)
        identifier = str(uuid.uuid4())
        path = ROOT / identifier
        path.mkdir(parents=True)
        hashes = {}
        if source:
            for agent in ["profit", "responsible"]:
                shutil.copyfile(source / f"{agent}.zip", path / f"{agent}.zip")
                hashes[agent] = hashlib.sha256(
                    (path / f"{agent}.zip").read_bytes()
                ).hexdigest()
        np.savez_compressed(path / "dataset.npz", dates=dates, prices=prices)
        job = {
            "id": identifier,
            "status": "queued",
            "created_at": now(),
            "updated_at": now(),
            "config": config.model_dump(mode="json"),
            "training_config": training_config,
            "data": provenance,
            "model_sha256": hashes,
        }
        write(path / "job.json", job)
        try:
            with (path / "worker.log").open("ab") as log:
                processes[identifier] = subprocess.Popen(
                    [sys.executable, "-m", "app.backtesting.worker", str(path)],
                    cwd=Path(__file__).resolve().parents[2],
                    stdout=log,
                    stderr=subprocess.STDOUT,
                )
        except OSError as exc:
            job.update(status="failed", error=str(exc), updated_at=now())
            write(path / "job.json", job)
            raise HTTPException(503, "Unable to launch backtest process")
        return job


@router.get("")
def list_backtests():
    return summaries()


@router.get("/{identifier}")
def detail(identifier: str):
    path = path_for(identifier)
    job = status(path)
    if job["status"] == "completed":
        job["result"] = read(path / "result.json")
    return job


@router.get("/{identifier}/export")
def export(
    identifier: str,
    format: str = Query("json", pattern="^(csv|json)$"),
    kind: str = Query("summary", pattern="^(summary|history)$"),
):
    path = path_for(identifier)
    job = status(path)
    if job["status"] != "completed":
        raise HTTPException(409, "Backtest must complete before export")
    result = read(path / "result.json")
    if format == "json":
        return Response(
            json.dumps(result, indent=2, allow_nan=False),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="backtest-{identifier}.json"'
            },
        )
    output = io.StringIO(newline="")
    data = result['data']
    label = ("REAL HISTORICAL ADJUSTED PRICES" if source_of(data) == 'real' else "SYNTHETIC PRICES") + "; ILLUSTRATIVE ESG; EDUCATIONAL BACKTESTING ONLY, NOT INVESTMENT ADVICE"
    provenance = {
        'data_source': source_of(data), 'provider': data.get('provider', 'Repository fixture'),
        'data_range': data.get('data_range', 'fixture'),
        'training_configuration': json.dumps(result.get('training_config'), sort_keys=True),
        'allocation_bounds': json.dumps(result.get('allocation_bounds'), sort_keys=True),
        'asset_universe': '|'.join(result['symbols']),
        'dataset_start': data.get('start_date', ''), 'dataset_end': data.get('end_date', ''),
        'price_adjustment': data.get('price_adjustment', 'Synthetic'),
        'dataset_sha256': data['sha256'], 'fetched_at': data.get('fetched_at', ''),
        'backtest_configuration': json.dumps(result['config'], sort_keys=True),
    }
    if kind == "summary":
        fields = [
            *provenance,
            "data_assumption",
            "strategy",
            "start_close",
            "end_close",
            "rebalance_frequency",
            "initial_capital",
            "esg_constrained",
            *METRICS,
        ]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for strategy in result["results"]:
            writer.writerow(
                {
                    **provenance,
                    "data_assumption": label,
                    "strategy": strategy["name"],
                    "start_close": result["period"]["start_close"],
                    "end_close": result["period"]["end_close"],
                    "rebalance_frequency": result["config"]["rebalance_frequency"],
                    "initial_capital": result["config"]["initial_capital"],
                    "esg_constrained": strategy["esg_constrained"],
                    **strategy["metrics"],
                }
            )
    else:
        fields = [
            *provenance,
            "data_assumption",
            "strategy",
            "date",
            "value",
            "cumulative_return",
            "drawdown",
            "rebalance",
            "fees",
            "slippage",
            "turnover",
            "end_esg",
            *[f"weight_{s}" for s in result["symbols"]],
        ]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for strategy in result["results"]:
            for row in strategy["history"]:
                writer.writerow(
                    {
                        **provenance,
                        "data_assumption": label,
                        "strategy": strategy["name"],
                        **{
                            k: v
                            for k, v in row.items()
                            if k not in {"weights", "target_weights"}
                        },
                        **{
                            f"weight_{s}": w
                            for s, w in zip(result["symbols"], row["weights"])
                        },
                    }
                )
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="backtest-{identifier}-{kind}.csv"'
        },
    )
