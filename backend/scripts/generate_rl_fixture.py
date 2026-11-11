"""Generate a reproducible synthetic fixture, not historical market observations."""

import csv
from datetime import date, timedelta
from pathlib import Path
import math
import random

rng = random.Random(202602)
prices = [470.0, 98.0, 190.0, 405.0, 1.0]
symbols = ["SPY", "AGG", "GLD", "QQQ", "CASH"]
path = Path(__file__).resolve().parents[1] / "data" / "rl_sample_prices.csv"
day = date(2022, 1, 3)
with path.open("w", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(["date", "symbol", "price"])
    for t in range(780):
        if t:
            factor = rng.gauss(0, 1)
            # Reproducible simulated regimes; the model receives no future regime signal.
            drift = 0.00015 + 0.00035 * math.sin(t / 85)
            for j, (beta, noise, mu) in enumerate(
                [
                    (0.008, 0.004, drift),
                    (0.0005, 0.002, 0.00006),
                    (-0.001, 0.008, 0.00012),
                    (0.012, 0.006, drift * 1.3),
                ]
            ):
                prices[j] *= math.exp(mu + beta * factor + noise * rng.gauss(0, 1))
        for s, p in zip(symbols, prices):
            writer.writerow([day.isoformat(), s, f"{p:.8f}"])
        day += timedelta(days=1)
        while day.weekday() >= 5:
            day += timedelta(days=1)
print(path)
