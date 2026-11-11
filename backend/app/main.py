from contextlib import asynccontextmanager
import csv
import io
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from app.database import initialize, connect
from app.services.portfolio import simulate, market
from app.rl.jobs import router as training_router

@asynccontextmanager
async def lifespan(app):
    initialize()
    yield

app = FastAPI(title="Verdant Portfolio Simulation", version="1.0.0", lifespan=lifespan)
app.include_router(training_router)
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
def market_data():
    assets, dates, prices = market()
    return {"assets": assets, "history": [{"date": d, **{a["symbol"]: (prices[d, a["symbol"]] / prices[dates[0], a["symbol"]] - 1) * 100 for a in assets}} for d in dates], "data_label": "Synthetic sample prices; illustrative ESG, not vendor ratings"}

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
