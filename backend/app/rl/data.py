"""Causal features from a separate, explicitly synthetic daily fixture."""

import csv
import hashlib
from pathlib import Path
import numpy as np

SYMBOLS = ("SPY", "AGG", "GLD", "QQQ", "CASH")
ESG = np.array(
    [68.0, 73.0, 45.0, 64.0, 50.0]
)  # simulated assumptions, never vendor ratings
DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "rl_sample_prices.csv"
WINDOW = 20


def load_data(path=DATA_PATH):
    with Path(path).open() as file:
        rows = list(csv.DictReader(file))
    dates = sorted({r["date"] for r in rows})
    lookup = {(r["date"], r["symbol"]): float(r["price"]) for r in rows}
    if len(lookup) != len(rows) or len(rows) != len(dates) * 5:
        raise ValueError("Expected one price per date and asset, no duplicates")
    prices = np.array([[lookup[d, s] for s in SYMBOLS] for d in dates])
    if len(dates) < 150 or not np.isfinite(prices).all() or (prices <= 0).any():
        raise ValueError("Need at least 150 complete positive price observations")
    return np.array(dates), prices


def splits(length):
    # Index t is a known close. Action at t earns return t -> t+1.
    # End is exclusive for decision indices. No realized return belongs to two splits.
    n = length - 1 - WINDOW
    if n < 100:
        raise ValueError("Insufficient data after warmup")
    a = WINDOW + int(n * 0.6)
    b = WINDOW + int(n * 0.8)
    return {"train": (WINDOW, a), "validation": (a, b), "test": (b, length - 1)}


def manifest(dates, prices, provenance=None):
    return {
        "data_source": "synthetic",
        "provider": "Repository seeded daily fixture",
        "data_range": "fixture",
        "price_adjustment": "Synthetic prices; no corporate actions",
        "start_date": str(dates[0]),
        "end_date": str(dates[-1]),
        "cash_assumption": "CASH is an account, not a ticker. Snapshot price is 1; configured annual yield accrues at 252 observed transitions/year in execution.",
        "label": "Seeded synthetic daily prices, not real historical quotes; illustrative ESG assumptions",
        "sha256": hashlib.sha256(prices.tobytes() + dates.tobytes()).hexdigest(),
        "observations": len(dates),
        "symbols": list(SYMBOLS),
        "esg": ESG.tolist(),
        **(provenance or {}),
        "splits": {
            k: {
                "decision_start": str(dates[a]),
                "first_return_end": str(dates[a + 1]),
                "last_return_end": str(dates[b]),
                "transitions": b - a,
            }
            for k, (a, b) in splits(len(dates)).items()
        },
    }
