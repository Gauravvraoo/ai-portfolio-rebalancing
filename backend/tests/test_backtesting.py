import numpy as np
import pytest
from pydantic import ValidationError
from app.backtesting.config import BacktestConfig
from app.backtesting.engine import backtest, interval, scheduled
from app.backtesting.metrics import performance
from app.backtesting.strategies import target_weights
from app.rl.constraints import Constraints
from app.rl.data import ESG, load_data, splits
from app.services.execution import execute


def history(values):
    return [
        {
            "value": v,
            "fees": i * 0.1,
            "slippage": i * 0.05,
            "turnover": i * 0.01,
            "end_esg": 60 + i,
        }
        for i, v in enumerate(values)
    ]


def test_all_metrics_against_independent_formulas():
    rows = history([100, 110, 99, 118.8])
    m = performance(rows, 0.02)
    returns = np.array([0.1, -0.1, 0.2])
    excess = returns - (1.02 ** (1 / 252) - 1)
    volatility = np.std(returns, ddof=1) * np.sqrt(252)
    annual = 1.188**84 - 1
    assert m["cumulative_return"] == pytest.approx(18.8)
    assert m["annualized_return"] == pytest.approx(annual * 100)
    assert m["volatility"] == pytest.approx(volatility * 100)
    assert m["sharpe_ratio"] == pytest.approx(np.mean(excess) * 252 / volatility)
    downside = np.sqrt(np.mean(np.minimum(excess, 0) ** 2)) * np.sqrt(252)
    assert m["sortino_ratio"] == pytest.approx(np.mean(excess) * 252 / downside)
    assert m["max_drawdown"] == pytest.approx(-10)
    assert m["calmar_ratio"] == pytest.approx(annual / 0.1)
    assert m["turnover"] == pytest.approx(0.06)
    assert m["fees"] == pytest.approx(0.6)
    assert m["slippage"] == pytest.approx(0.3)
    assert m["transaction_costs"] == pytest.approx(0.9)
    assert m["weighted_esg"] == pytest.approx(62)
    assert m["final_value"] == pytest.approx(118.8)


def test_undefined_ratios_and_bad_data():
    metrics = performance(history([100, 100, 100]))
    assert metrics["sharpe_ratio"] is None
    assert metrics["sortino_ratio"] is None
    assert metrics["calmar_ratio"] is None
    assert metrics["max_drawdown"] == 0
    assert performance(history([100, 110, 130]))["sortino_ratio"] is None
    for values in [[1, 2], [100, 0, 20], [100, float("nan"), 110]]:
        with pytest.raises(ValueError):
            performance(history(values))


@pytest.mark.parametrize(
    "strategy", ["buy_hold", "equal_weight", "momentum", "mean_variance"]
)
def test_all_benchmark_allocations(strategy):
    rng = np.random.default_rng(5)
    trailing = rng.normal(0, 0.01, (60, 5))
    trailing[:, 0] += 0.003
    bounds = Constraints([0, 0, 0, 0, 0.02], [0.6] * 5, ESG, 65)
    weights = target_weights(strategy, trailing, bounds)
    assert weights.sum() == pytest.approx(1)
    assert (weights >= bounds.lower - 1e-8).all()
    assert (weights <= bounds.upper + 1e-8).all()
    assert weights @ ESG >= 65 - 1e-8


def test_equal_buy_hold_and_momentum_definitions():
    bounds = Constraints([0] * 5, [1] * 5, ESG)
    trailing = np.tile([0.03, 0.01, -0.01, 0.02, 0], (60, 1))
    np.testing.assert_allclose(
        target_weights("buy_hold", trailing, bounds),
        [0.35, 0.25, 0.15, 0.2, 0.05],
        atol=1e-10,
    )
    np.testing.assert_allclose(
        target_weights("equal_weight", trailing, bounds), [0.2] * 5, atol=1e-10
    )
    np.testing.assert_allclose(
        target_weights("momentum", trailing, bounds), [0.5, 0, 0, 0.5, 0], atol=1e-10
    )
    # CASH can win in a falling market.
    trailing[:, :4] = -0.01
    assert target_weights("momentum", trailing, bounds)[4] == pytest.approx(0.5)


def test_mean_variance_objective_and_error_reporting(monkeypatch):
    from types import SimpleNamespace
    from app.backtesting import strategies

    rng = np.random.default_rng(30)
    trailing = rng.normal(0, 0.01, (60, 5))
    bounds = Constraints([0] * 5, [1] * 5, ESG)
    weights = target_weights("mean_variance", trailing, bounds, 5)
    cov = np.cov(trailing, rowvar=False) * 252
    cov = 0.9 * cov + 0.1 * np.diag(np.diag(cov)) + np.eye(5) * 1e-6
    mu = trailing.mean(axis=0) * 252
    objective = lambda w: 2.5 * w @ cov @ w - mu @ w
    assert objective(weights) <= objective(np.ones(5) / 5) + 1e-8
    monkeypatch.setattr(
        strategies,
        "minimize",
        lambda *a, **kw: SimpleNamespace(
            success=False, message="deliberate solver failure"
        ),
    )
    with pytest.raises(ValueError, match="solver failure"):
        target_weights("mean_variance", trailing, bounds)
    with pytest.raises(ValueError):
        target_weights("unknown", trailing, bounds)


def test_shared_execution_exact_hold_and_capital_scaling():
    weights = np.array([0.3, 0.2, 0.1, 0.3, 0.1])
    returns = np.array([0.01, -0.01, 0.02, -0.03, 0.0001])
    held = execute(100000, weights, None, returns, 10, 5)
    assert held["fees"] == held["slippage"] == held["turnover"] == 0
    assert held["value"] == pytest.approx(100000 * (weights @ (1 + returns)))
    target = np.ones(5) / 5
    a = execute(100000, weights, target, returns, 10, 5)
    b = execute(50000, weights, target, returns, 10, 5)
    for key in ["value", "fees", "slippage"]:
        assert a[key] == pytest.approx(2 * b[key])
    assert a["turnover"] == pytest.approx(b["turnover"])
    np.testing.assert_allclose(a["weights"], b["weights"])


def test_calendar_schedule_not_hindsight():
    dates = np.array(
        ["2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02", "2024-02-05"]
    )
    assert scheduled(dates, 0, 0, "monthly")
    assert not scheduled(dates, 0, 1, "monthly")
    assert scheduled(dates, 0, 2, "monthly")
    assert not scheduled(dates, 0, 3, "weekly")
    assert scheduled(dates, 0, 4, "weekly")
    assert scheduled(dates, 0, 3, "daily")


@pytest.mark.parametrize("frequency", ["daily", "weekly", "monthly"])
def test_historical_replay_shared_period_and_costs(frequency):
    dates, prices = load_data()
    config = BacktestConfig(
        rebalance_frequency=frequency, initial_capital=50000, apply_esg_to_all=True
    )
    result = backtest(dates, prices, config)
    expected_dates = list(dates[splits(len(dates))["test"][0] :])
    for strategy in result["results"]:
        rows = strategy["history"]
        assert [r["date"] for r in rows] == expected_dates
        assert rows[0]["value"] == 50000
        assert rows[0]["weights"] == [0, 0, 0, 0, 1]
        assert strategy["metrics"]["transaction_costs"] > 0
        for row in rows[1:]:
            assert sum(row["weights"]) == pytest.approx(1)
            if not row["rebalance"]:
                assert row["fees"] == row["slippage"] == row["turnover"] == 0
                assert row["target_weights"] is None
            else:
                assert np.array(row["target_weights"]) @ ESG >= 65 - 1e-8
        assert strategy["metrics"] == performance(rows)
    assert result["results"][0]["rebalances"] == 1
    if frequency == "daily":
        assert result["results"][1]["rebalances"] == len(expected_dates) - 1


def test_buy_hold_matches_direct_fractional_share_calculation():
    dates, prices = load_data()
    config = BacktestConfig(fee_bps=0, slippage_bps=0, cash_annual_return=0)
    result = backtest(dates, prices, config)
    start, end = interval(dates, config)
    expected = 100000 * np.sum(
        np.array([0.35, 0.25, 0.15, 0.2, 0.05]) * prices[end] / prices[start]
    )
    assert result["results"][0]["history"][-1]["value"] == pytest.approx(expected)


def test_future_mutation_cannot_change_any_benchmark_past():
    dates, prices = load_data()
    config = BacktestConfig(rebalance_frequency="weekly")
    start, end = interval(dates, config)
    cutoff = start + 60
    mutated = prices.copy()
    mutated[cutoff + 1 :, :4] *= 10
    a = backtest(dates, prices, config)
    b = backtest(dates, mutated, config)
    for first, second in zip(a["results"], b["results"]):
        assert first["history"][:61] == second["history"][:61]


def test_periods_reject_training_validation_and_invalid_configs():
    dates, _ = load_data()
    for config in [
        BacktestConfig(start_date=str(dates[100])),
        BacktestConfig(end_date=str(dates[500])),
        BacktestConfig(start_date="2024-05-31", end_date="2024-06-01"),
    ]:
        with pytest.raises(ValueError):
            interval(dates, config)
    for payload in [
        {"initial_capital": -1},
        {"fee_bps": float("inf")},
        {"rebalance_frequency": "yearly"},
        {"lookback": 1},
        {"extra_field": 1},
    ]:
        with pytest.raises(ValidationError):
            BacktestConfig(**payload)
