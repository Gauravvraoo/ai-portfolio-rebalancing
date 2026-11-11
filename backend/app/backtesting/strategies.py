"""Rules see only a supplied trailing window ending at the decision close."""

import numpy as np
from scipy.optimize import minimize

BENCHMARKS = {
    "buy_hold": "Buy & hold",
    "equal_weight": "Equal weight",
    "mean_variance": "Rolling mean–variance",
    "momentum": "Momentum",
}
NAMES = {**BENCHMARKS, "profit": "Profit PPO", "responsible": "Responsible PPO"}


def target_weights(strategy, trailing, constraints, risk_aversion=5):
    if strategy == "buy_hold":
        return constraints.project([0.35, 0.25, 0.15, 0.20, 0.05])
    if strategy == "equal_weight":
        return constraints.project(np.ones(5) / 5)
    if strategy == "momentum":
        momentum = np.prod(1 + trailing, axis=0) - 1
        # Stable order resolves exact ties; include cash as an investable candidate.
        winners = np.argsort(-momentum, kind="stable")[:2]
        target = np.zeros(5)
        target[winners] = 0.5
        return constraints.project(target)
    if strategy != "mean_variance":
        raise ValueError("Unknown benchmark")
    if len(trailing) < 20:
        raise ValueError("Mean–variance estimation requires 20 trailing returns")
    mean = trailing.mean(axis=0) * 252
    covariance = np.cov(trailing, rowvar=False, ddof=1) * 252
    # Shrink to diagonal and add a ridge to stabilize this small synthetic universe.
    covariance = (
        0.9 * covariance + 0.1 * np.diag(np.diag(covariance)) + np.eye(5) * 1e-6
    )
    objective = lambda w: 0.5 * risk_aversion * (w @ covariance @ w) - mean @ w
    gradient = lambda w: risk_aversion * covariance @ w - mean
    restrictions = [
        {"type": "eq", "fun": lambda w: w.sum() - 1, "jac": lambda w: np.ones(5)}
    ]
    if constraints.minimum:
        restrictions.append(
            {
                "type": "ineq",
                "fun": lambda w: w @ constraints.scores - constraints.minimum,
                "jac": lambda w: constraints.scores,
            }
        )
    result = minimize(
        objective,
        constraints.project(np.ones(5) / 5),
        jac=gradient,
        method="SLSQP",
        bounds=list(zip(constraints.lower, constraints.upper)),
        constraints=restrictions,
        options={"ftol": 1e-10, "maxiter": 200},
    )
    if not result.success or not np.isfinite(result.x).all():
        raise ValueError(f"Mean–variance optimization failed: {result.message}")
    # Repair only numerical residue after the constrained solve.
    return constraints.project(result.x)
