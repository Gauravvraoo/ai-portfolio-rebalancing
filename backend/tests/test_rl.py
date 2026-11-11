import math
import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env
from pydantic import ValidationError
from app.rl.config import ExperimentConfig
from app.rl.constraints import Constraints
from app.rl.data import ESG, WINDOW, load_data, splits
from app.rl.environment import PortfolioEnv, reward_components


@pytest.fixture
def data():
    return load_data()


def make_env(data, config=None, responsible=False, interval=None):
    dates, prices = data
    start, end = interval or splits(len(dates))["train"]
    return PortfolioEnv(
        prices, dates, start, end, config or ExperimentConfig(), responsible
    )


def test_reward_components():
    config = ExperimentConfig(
        risk_penalty=2, drawdown_penalty=3, cost_penalty=4, esg_penalty=5, min_esg=65
    )
    terms = reward_components(0.01, 0.02, 0.1, 0.001, 60, config, True)
    assert terms == pytest.approx(
        {
            "growth": math.log1p(0.01),
            "risk": -2 * 0.02**2,
            "drawdown": -0.3,
            "cost": -0.004,
            "esg": -0.25,
        }
    )
    assert reward_components(0.01, 0.02, 0.1, 0.001, 60, config, False)["esg"] == 0
    assert reward_components(0.01, 0.02, 0.1, 0.001, 70, config, True)["esg"] == 0


def test_projection_random_actions():
    bounds = Constraints([0.05, 0.1, 0, 0, 0.02], [0.4, 0.6, 0.3, 0.5, 0.4], ESG, 66)
    rng = np.random.default_rng(55)
    for action in [
        np.zeros(5),
        np.ones(5),
        *[rng.uniform(-2, 2, 5) for _ in range(100)],
    ]:
        weights = bounds.project(action)
        assert weights.sum() == pytest.approx(1, abs=1e-9)
        assert (weights >= bounds.lower - 1e-9).all()
        assert (weights <= bounds.upper + 1e-9).all()
        assert weights @ ESG >= 66 - 1e-8
    with pytest.raises(ValueError, match="finite"):
        bounds.project([float("nan")] * 5)


@pytest.mark.parametrize(
    "changes",
    [
        {"min_esg": 99},
        {"min_weights": [0.3] * 5},
        {"max_weights": [0.1] * 5},
        {"min_weights": [0.7, 0, 0, 0, 0]},
        {"max_weights": [float("nan")] * 5},
        {"fee_bps": float("inf")},
        {"max_weights": [0.6, 0.6, 0.6, 0.6]},
    ],
)
def test_infeasible_config(changes):
    with pytest.raises(ValidationError):
        ExperimentConfig(**changes)


def test_esg_feasibility_boundary():
    base = Constraints([0] * 5, [0.6] * 5, ESG)
    edge = Constraints([0] * 5, [0.6] * 5, ESG, base.maximum_esg)
    assert edge.project([0, 0, 1, 0, 0]) @ ESG == pytest.approx(base.maximum_esg)
    with pytest.raises(ValueError, match="maximum achievable"):
        Constraints([0] * 5, [0.6] * 5, ESG, base.maximum_esg + 0.01)


def test_accounting_and_cash_returns(data):
    config = ExperimentConfig(
        min_weights=[0] * 5,
        max_weights=[1] * 5,
        fee_bps=10,
        slippage_bps=5,
        cash_annual_return=0.02,
    )
    env = make_env(data, config)
    env.reset(seed=7)
    _, reward, done, _, info = env.step([1, 0, 0, 0, 0])
    # All cash -> all SPY. Turnover is half(initial cash sold + post-cost SPY bought).
    rate = 0.0015
    invested = 100000 * (1 - rate / 2) / (1 + rate / 2)
    traded = (100000 + invested) / 2
    t = env.start
    expected = invested * data[1][t + 1, 0] / data[1][t, 0]
    assert info["value"] == pytest.approx(expected)
    assert info["fees"] == pytest.approx(traded * 0.001)
    assert info["slippage"] == pytest.approx(traded * 0.0005)
    assert invested + info["fees"] + info["slippage"] == pytest.approx(100000)
    assert info["turnover"] == pytest.approx(traded / 100000)
    assert info["weights"] == pytest.approx([1, 0, 0, 0, 0])
    assert reward == pytest.approx(sum(info["reward_components"].values()))
    cash = make_env(data, config, interval=(WINDOW, WINDOW + 3))
    cash.reset()
    for i in range(3):
        _, _, done, _, info = cash.step([0, 0, 0, 0, 1])
        assert info["fees"] + info["slippage"] == pytest.approx(0, abs=1e-8)
    assert info["value"] == pytest.approx(100000 * 1.02 ** (3 / 252))
    assert done
    with pytest.raises(RuntimeError):
        cash.step([0, 0, 0, 0, 1])


def test_turnover_repeated_and_drift(data):
    config = ExperimentConfig(
        min_weights=[0] * 5,
        max_weights=[1] * 5,
        fee_bps=0,
        slippage_bps=0,
        cash_annual_return=0,
    )
    env = make_env(data, config)
    env.reset()
    _, _, _, _, first = env.step([0.5, 0.5, 0, 0, 0])
    assert sum(first["weights"]) == pytest.approx(1)
    assert first["weights"] != [0.5, 0.5, 0, 0, 0]
    _, _, _, _, second = env.step(first["weights"])
    assert second["turnover"] == pytest.approx(0, abs=1e-10)
    _, _, _, _, third = env.step([0, 0, 0, 0, 1])
    assert third["turnover"] == pytest.approx(1)


def test_env_contract_constraints_and_reproducibility(data):
    env = make_env(data, responsible=True, interval=(WINDOW, WINDOW + 5))
    check_env(env, skip_render_check=True)
    obs, _ = env.reset(seed=42)
    assert obs.shape == (130,)
    assert env.observation_space.contains(obs)
    for i in range(5):
        obs, reward, done, truncated, info = env.step([0, 0, 1, 0, 0])
        assert info["esg"] >= env.config.min_esg - 1e-8
        assert np.isfinite(obs).all() and math.isfinite(reward)
        assert np.all(
            np.array(info["target_weights"]) <= np.array(env.config.max_weights) + 1e-8
        )
        assert not truncated
        assert done == (i == 4)
    env.reset(seed=42)
    a = env.step([0.1, 0.2, 0.3, 0.2, 0.2])
    env.reset(seed=42)
    b = env.step([0.1, 0.2, 0.3, 0.2, 0.2])
    np.testing.assert_array_equal(a[0], b[0])
    assert a[1:] == b[1:]


def test_future_price_mutation_does_not_change_past_features_or_rewards(data):
    dates, prices = data
    env = make_env(data)
    changed = prices.copy()
    cutoff = env.start + 5
    changed[cutoff + 1 :, :4] *= 100
    future_env = make_env((dates, changed))
    a, _ = env.reset()
    b, _ = future_env.reset()
    np.testing.assert_array_equal(a, b)
    for _ in range(5):
        a = env.step([0.2] * 5)
        b = future_env.step([0.2] * 5)
        np.testing.assert_array_equal(a[0], b[0])
        assert a[1:] == b[1:]
    # Feature construction uses no whole-dataset normalization or fitted scaler.


def test_chronological_splits_no_return_overlap(data):
    dates, prices = data
    bounds = splits(len(dates))
    realized = []
    for split, (a, b) in bounds.items():
        env = make_env(data, interval=(a, b))
        env.reset()
        indices = []
        done = False
        while not done:
            _, _, done, _, info = env.step([0.2] * 5)
            indices.append(env.t)
        assert indices == list(range(a + 1, b + 1))
        realized.append(set(indices))
    assert realized[0].isdisjoint(realized[1])
    assert realized[1].isdisjoint(realized[2])
    assert max(realized[0]) < min(realized[1])
    assert max(realized[1]) < min(realized[2])
    assert bounds["test"][1] == len(prices) - 1


def test_validation_and_test_mutations_cannot_change_training_trajectory(data):
    dates, prices = data
    end = splits(len(dates))["train"][1]
    changed = prices.copy()
    changed[end + 1 :, :4] *= np.linspace(0.1, 100, len(prices) - end - 1)[:, None]
    original = make_env(data)
    modified = make_env((dates, changed))
    original.reset(seed=7)
    modified.reset(seed=7)
    done = False
    while not done:
        a = original.step([0.2] * 5)
        b = modified.step([0.2] * 5)
        np.testing.assert_array_equal(a[0], b[0])
        assert a[1:] == b[1:]
        done = a[2]
