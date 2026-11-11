"""Shared self-financing execution for PPO environments and historical backtests."""

import numpy as np


def execute(wealth, weights, target, next_returns, fee_bps, slippage_bps):
    """None target means an exact hold: no constraint repair, trades or costs."""
    holdings = wealth * weights
    if target is None:
        invested, traded = wealth, 0.0
        target = weights
    else:
        rate = (fee_bps + slippage_bps) / 10000
        lo, hi = 0.0, wealth
        for _ in range(45):
            invested = (lo + hi) / 2
            traded = 0.5 * np.abs(invested * target - holdings).sum()
            if invested + rate * traded > wealth:
                hi = invested
            else:
                lo = invested
        invested = (lo + hi) / 2
        traded = float(0.5 * np.abs(invested * target - holdings).sum())
    next_holdings = invested * target * (1 + next_returns)
    value = float(next_holdings.sum())
    return {
        "value": value,
        "weights": next_holdings / value,
        "fees": traded * fee_bps / 10000,
        "slippage": traded * slippage_bps / 10000,
        "turnover": traded / wealth,
    }
