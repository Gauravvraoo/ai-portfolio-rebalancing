from contextlib import asynccontextmanager
import csv
import io
import subprocess
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field, model_validator
from app.database import initialize, connect
from app.services.portfolio import simulate, market
from app.rl.jobs import router as training_router
from app.backtesting.jobs import router as backtesting_router
from app.rl import jobs as training_jobs
from app.backtesting import jobs as backtest_jobs
from app.rl.storage import read, write, now
from app.market_data.service import DataSelection, dataset, configuration_diagnostics
from app.market_data.diagnostics import MarketDataHTTPError
from app.market_data.analysis import summarize, correlations
import numpy as np

@asynccontextmanager
async def lifespan(app):
    initialize()
    # Processes are not restored with saved artifacts. Under the documented
    # single-API-worker model, unfinished jobs from a previous API lifetime
    # must not permanently block new work or appear to keep progressing.
    for root, states in [
        (training_jobs.storage.ROOT, {"queued", "running", "evaluating"}),
        (backtest_jobs.ROOT, {"queued", "running"}),
    ]:
        for file in root.glob("*/job.json"):
            job = read(file)
            if job["status"] in states:
                job.update(status="failed", updated_at=now(),
                           error="API restarted before completion. Create a new run; previous artifacts are retained.")
                write(file, job)
    try:
        yield
    finally:
        for manager in (training_jobs, backtest_jobs):
            for proc in manager.processes.values():
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()
            manager.processes.clear()

app = FastAPI(title="Verdant Portfolio Simulation", version="1.0.0", lifespan=lifespan)
@app.exception_handler(MarketDataHTTPError)
async def historical_data_error(request, exc):
    return JSONResponse(status_code=exc.status_code, headers=exc.headers,
                        content={"detail": exc.detail, "diagnostics": exc.diagnostics})

@app.get("/api/market/diagnostics")
def historical_diagnostics():
    return configuration_diagnostics()

app.include_router(training_router)
app.include_router(backtesting_router)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

class Allocation(BaseModel):
    weights: dict[str, float] = Field(description="Long-only weights summing to 1")

    @model_validator(mode="after")
    def validate_weights(self):
        if set(self.weights) != {"SPY", "AGG", "GLD", "QQQ", "CASH"}:
            raise ValueError("Provide exactly SPY, AGG, GLD, QQQ and CASH")
        if any(not (0 <= w <= 1) for w in self.weights.values()):
            raise ValueError("Weights must be finite and between zero and one")
        if abs(sum(self.weights.values()) - 1) > 1e-6:
            raise ValueError("Weights must sum to 1")
        return self

@app.get("/api/health")
def health():
    with connect() as db:
        db.execute("SELECT 1").fetchone()
    return {"status": "ok", "database": "connected", "mode": "educational simulation"}

@app.get("/api/portfolio")
def portfolio():
    return simulate()

@app.get("/api/market")
def market_data(data_source: str = "synthetic", data_range: str = "3Y",
                refresh: bool = False,
                cash_annual_return: float = Query(0.02, ge=0, le=0.2, allow_inf_nan=False)):
    try:
        selection = DataSelection(data_source=data_source, data_range=data_range)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    if selection.data_source == 'real':
        dates, prices, provenance = dataset(selection, refresh=refresh)
        return summarize(dates, prices, provenance, cash_annual_return)
    assets, dates, prices = market()
    values = np.array([[prices[d, a['symbol']] for a in assets] for d in dates])
    returns = values[1:] / values[:-1] - 1
    for i, asset in enumerate(assets):
        asset['annualized_volatility'] = float(returns[:, i].std(ddof=1) * np.sqrt(12) * 100)
    return {"assets": assets, "history": [{"date": d, **{a["symbol"]: (prices[d, a["symbol"]] / prices[dates[0], a["symbol"]] - 1) * 100 for a in assets}} for d in dates],
            "data_label": "Synthetic sample prices; illustrative ESG, not vendor ratings",
            "data": {"data_source": "synthetic", "provider": "Repository monthly fixture", "start_date": dates[0], "end_date": dates[-1], "price_adjustment": "Synthetic monthly prices; baseline CASH earns zero interest"},
            "correlation": correlations(returns), "frequency": "monthly"}

@app.post("/api/simulate")
def simulation(allocation: Allocation):
    return simulate(allocation.weights)

@app.get("/api/strategies")
def strategies():
    presets = {"Balanced": [0.35, .25, .15, .20, .05], "Defensive": [.20, .45, .15, .05, .15], "Growth": [.35, .10, .05, .45, .05]}
    return [{"name": name, **simulate(dict(zip(["SPY", "AGG", "GLD", "QQQ", "CASH"], weights)))} for name, weights in presets.items()]

@app.get("/api/report")
def report():
    result = simulate()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Educational simulation — synthetic sample prices; illustrative ESG"])
    writer.writerow(["date", "portfolio_value_usd", "drawdown_percent"])
    for row in result["history"]:
        writer.writerow([row["date"], row["value"], row["drawdown"]])
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="verdant-simulation.csv"'})
