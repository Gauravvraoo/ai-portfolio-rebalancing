"""Self-financing long-only daily rebalancing with strictly causal observations."""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
from app.rl.constraints import Constraints
from app.rl.data import ESG, WINDOW
from app.services.execution import execute


def reward_components(
    net_return, volatility, drawdown, cost_fraction, proposed_esg, config, responsible
):
    # Net return already includes execution costs; explicit cost term discourages turnover further.
    components = {
        "growth": float(np.log1p(net_return)),
        "risk": -config.risk_penalty * float(volatility**2),
        "drawdown": -config.drawdown_penalty * float(drawdown),
        "cost": -config.cost_penalty * float(cost_fraction),
        "esg": (
            -config.esg_penalty * max(0.0, (config.min_esg - proposed_esg) / 100)
            if responsible
            else 0.0
        ),
    }
    return components


class PortfolioEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self,
        prices,
        dates,
        start,
        end,
        config,
        responsible=False,
        initial_capital=100000.0,
    ):
        super().__init__()
        self.prices = np.asarray(prices, dtype=float).copy()
        self.dates = np.asarray(dates)
        if (
            self.prices.shape != (len(dates), 5)
            or not np.isfinite(self.prices).all()
            or (self.prices <= 0).any()
        ):
            raise ValueError("Invalid market price matrix")
        if not WINDOW <= start < end < len(dates):
            raise ValueError("Invalid chronological decision interval")
        if not np.isfinite(initial_capital) or initial_capital <= 0:
            raise ValueError("Initial capital must be positive and finite")
        self.initial_capital = initial_capital
        self.start, self.end, self.config, self.responsible = (
            start,
            end,
            config,
            responsible,
        )
        self.returns = np.zeros_like(self.prices)
        self.returns[1:] = self.prices[1:] / self.prices[:-1] - 1
        # Explicit constant cash-rate assumption overrides the flat synthetic CASH quote.
        self.returns[:, 4] = (1 + config.cash_annual_return) ** (1 / 252) - 1
        self.constraints = Constraints(
            config.min_weights,
            config.max_weights,
            ESG,
            config.min_esg if responsible else 0,
        )
        self.unconstrained_esg = Constraints(
            config.min_weights, config.max_weights, ESG, 0
        )
        self.action_space = spaces.Box(0, 1, shape=(5,), dtype=np.float32)
        # 20x5 trailing returns; 5 volatility, momentum, asset DD, weights, ESG; 5 state/cost values.
        self.observation_space = spaces.Box(
            -np.inf, np.inf, shape=(130,), dtype=np.float32
        )

    def _observation(self):
        trailing = self.returns[self.t - WINDOW + 1 : self.t + 1]
        past = self.prices[self.t - WINDOW : self.t + 1]
        vol = trailing.std(axis=0, ddof=1)
        momentum = np.prod(1 + trailing, axis=0) - 1
        asset_dd = past[-1] / past.max(axis=0) - 1
        return np.concatenate(
            [
                trailing.ravel(),
                vol,
                momentum,
                asset_dd,
                self.weights,
                ESG / 100,
                [
                    self.drawdown,
                    self.last_cost,
                    self.total_turnover,
                    self.config.fee_bps / 10000,
                    self.config.slippage_bps / 10000,
                ],
            ]
        ).astype(np.float32)

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.t = self.start
        self.wealth = self.peak = self.initial_capital
        # Begin in cash; the first allocation pays its actual execution costs.
        self.weights = np.array([0.0, 0.0, 0.0, 0.0, 1.0])
        self.drawdown = self.last_cost = self.total_turnover = 0.0
        self.finished = False
        return self._observation(), {
            "date": str(self.dates[self.t]),
            "value": self.wealth,
        }

    def step(self, action):
        return self._advance(action, rebalance=True)

    def hold(self):
        return self._advance(None, rebalance=False)

    def _advance(self, action, rebalance):
        if self.finished:
            raise RuntimeError("Episode is complete; reset before stepping")
        proposed = (
            self.unconstrained_esg.project(action) if rebalance else self.weights.copy()
        )
        target = self.constraints.project(action) if rebalance else self.weights.copy()
        previous = self.wealth
        execution = execute(
            previous,
            self.weights,
            target if rebalance else None,
            self.returns[self.t + 1],
            self.config.fee_bps,
            self.config.slippage_bps,
        )
        self.wealth, self.weights = execution["value"], execution["weights"]
        fees, slippage, turnover = (
            execution["fees"],
            execution["slippage"],
            execution["turnover"],
        )
        self.peak = max(self.peak, self.wealth)
        self.drawdown = 1 - self.wealth / self.peak
        self.last_cost = (fees + slippage) / previous
        self.total_turnover += turnover
        trailing = self.returns[self.t - WINDOW + 1 : self.t + 1]
        vol = float(np.std(trailing @ target, ddof=1))
        net_return = self.wealth / previous - 1
        components = reward_components(
            net_return,
            vol,
            self.drawdown,
            self.last_cost,
            float(proposed @ ESG),
            self.config,
            self.responsible,
        )
        self.t += 1
        self.finished = self.t >= self.end
        info = {
            "date": str(self.dates[self.t]),
            "value": self.wealth,
            "net_return": net_return,
            "drawdown": self.drawdown,
            "turnover": turnover,
            "fees": fees,
            "slippage": slippage,
            "esg": float(target @ ESG),
            "end_esg": float(self.weights @ ESG),
            "target_weights": target.tolist(),
            "weights": self.weights.tolist(),
            "reward_components": components,
            "reward": float(sum(components.values())),
        }
        return self._observation(), info["reward"], self.finished, False, info
