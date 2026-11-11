"""Percent metrics use daily observations and 252 trading periods per year."""

import numpy as np

METRICS = [
    "cumulative_return",
    "annualized_return",
    "volatility",
    "sharpe_ratio",
    "sortino_ratio",
    "max_drawdown",
    "calmar_ratio",
    "turnover",
    "fees",
    "slippage",
    "transaction_costs",
    "weighted_esg",
    "final_value",
]


def performance(history, risk_free_rate=0):
    values = np.array([row["value"] for row in history], dtype=float)
    if len(values) < 3 or not np.isfinite(values).all() or (values <= 0).any():
        raise ValueError(
            "Metrics need at least two finite positive return observations"
        )
    returns = values[1:] / values[:-1] - 1
    n = len(returns)
    cumulative = values[-1] / values[0] - 1
    annual = float(np.expm1(np.log(values[-1] / values[0]) * 252 / n))
    volatility = float(returns.std(ddof=1) * np.sqrt(252))
    excess = returns - ((1 + risk_free_rate) ** (1 / 252) - 1)
    downside = float(np.sqrt(np.mean(np.minimum(excess, 0) ** 2)) * np.sqrt(252))
    drawdowns = values / np.maximum.accumulate(values) - 1
    maximum = float(-drawdowns.min())
    fees = sum(row["fees"] for row in history[1:])
    slippage = sum(row["slippage"] for row in history[1:])
    return {
        "cumulative_return": float(cumulative * 100),
        "annualized_return": annual * 100,
        "volatility": volatility * 100,
        "sharpe_ratio": (
            float(excess.mean() * 252 / volatility) if volatility > 1e-12 else None
        ),
        "sortino_ratio": (
            float(excess.mean() * 252 / downside) if downside > 1e-12 else None
        ),
        "max_drawdown": -maximum * 100,
        "calmar_ratio": annual / maximum if maximum > 1e-12 else None,
        "turnover": sum(row["turnover"] for row in history[1:]),
        "fees": fees,
        "slippage": slippage,
        "transaction_costs": fees + slippage,
        "weighted_esg": float(np.mean([row["end_esg"] for row in history[1:]])),
        "final_value": float(values[-1]),
    }
