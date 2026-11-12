"""Historical replay: identical execution, clocks and economics for all strategies."""

from datetime import date
import numpy as np
from app.rl.config import ExperimentConfig
from app.rl.data import ESG, SYMBOLS, splits, manifest
from app.rl.environment import PortfolioEnv
from app.backtesting.metrics import performance
from app.backtesting.strategies import BENCHMARKS, NAMES, target_weights


def interval(dates, config):
    start, end = splits(len(dates))["test"]
    if config.start_date:
        matches = np.flatnonzero(dates == config.start_date.isoformat())
        if not len(matches) or not start <= int(matches[0]) < end:
            raise ValueError(
                "Start close must be an observed close in the held-out test interval"
            )
        start = int(matches[0])
    if config.end_date:
        matches = np.flatnonzero(dates == config.end_date.isoformat())
        if not len(matches) or not start < int(matches[0]) <= end:
            raise ValueError(
                "End close must be an observed close in the held-out test interval"
            )
        end = int(matches[0])
    if end - start < 2 or start < config.lookback:
        raise ValueError(
            "Need at least two test returns and sufficient causal lookback"
        )
    return start, end


def scheduled(dates, start, t, frequency):
    if t == start or frequency == "daily":
        return True
    previous = date.fromisoformat(str(dates[t - 1]))
    current = date.fromisoformat(str(dates[t]))
    if frequency == "weekly":
        return previous.isocalendar()[:2] != current.isocalendar()[:2]
    return (previous.year, previous.month) != (current.year, current.month)


def backtest(dates, prices, config, training_config=None, models=None, provenance=None):
    start, end = interval(dates, config)
    settings = dict(training_config or {})
    settings.update(
        fee_bps=config.fee_bps,
        slippage_bps=config.slippage_bps,
        cash_annual_return=config.cash_annual_return,
        min_esg=config.min_esg,
    )
    env_config = ExperimentConfig(**settings)
    strategies = list(BENCHMARKS) + (list(models) if models else [])
    results = []
    for strategy in strategies:
        responsible = config.apply_esg_to_all or strategy == "responsible"
        env = PortfolioEnv(
            prices[: end + 1],
            dates[: end + 1],
            start,
            end,
            env_config,
            responsible,
            initial_capital=config.initial_capital,
        )
        observation, _ = env.reset()
        history = [
            {
                "date": str(dates[start]),
                "value": env.wealth,
                "cumulative_return": 0.0,
                "drawdown": 0.0,
                "weights": env.weights.tolist(),
                "target_weights": None,
                "rebalance": False,
                "fees": 0.0,
                "slippage": 0.0,
                "turnover": 0.0,
                "end_esg": float(env.weights @ ESG),
            }
        ]
        while env.t < end:
            t = env.t
            trade = (
                (t == start)
                if strategy == "buy_hold"
                else scheduled(dates, start, t, config.rebalance_frequency)
            )
            if trade:
                if strategy in BENCHMARKS:
                    trailing = env.returns[t - config.lookback + 1 : t + 1].copy()
                    action = target_weights(
                        strategy, trailing, env.constraints, config.risk_aversion
                    )
                else:
                    action, _ = models[strategy].predict(
                        observation, deterministic=True
                    )
                observation, _, _, _, info = env.step(action)
            else:
                observation, _, _, _, info = env.hold()
            history.append(
                {
                    "date": info["date"],
                    "value": info["value"],
                    "cumulative_return": (info["value"] / config.initial_capital - 1)
                    * 100,
                    "drawdown": -info["drawdown"] * 100,
                    "weights": info["weights"],
                    "target_weights": info["target_weights"] if trade else None,
                    "rebalance": trade,
                    "fees": info["fees"],
                    "slippage": info["slippage"],
                    "turnover": info["turnover"],
                    "end_esg": info["end_esg"],
                }
            )
        results.append(
            {
                "id": strategy,
                "name": NAMES[strategy],
                "history": history,
                "metrics": performance(history, config.risk_free_rate),
                "esg_constrained": responsible,
                "rebalances": sum(row["rebalance"] for row in history),
            }
        )
    return {
        "config": config.model_dump(mode="json"),
        "data": manifest(dates, prices, provenance),
        "period": {
            "start_close": str(dates[start]),
            "first_return_end": str(dates[start + 1]),
            "end_close": str(dates[end]),
            "returns": end - start,
        },
        "symbols": list(SYMBOLS),
        "allocation_bounds": {
            "min": env_config.min_weights,
            "max": env_config.max_weights,
        },
        "results": results,
        "methodology": "Historical replay with illustrative ESG (not verified ratings); educational only, not investment advice. Dataset provenance is recorded separately. Known-close decisions earn next-close returns. All strategies use the same test interval, initial cash, cash yield and self-financing half-L1 traded-notional costs, including cash. Buy & hold trades only initially; others follow the selected calendar frequency. ESG floor applies only to Responsible PPO unless the all-strategy overlay is enabled. Constraints apply at trades, not between them. No retraining or test-based checkpoint selection. Changed inference settings can differ from PPO training. Metrics annualize at 252 periods; ratios with zero denominators are null. Annualization of short samples is extrapolation.",
    }
