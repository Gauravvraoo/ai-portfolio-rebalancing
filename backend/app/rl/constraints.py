"""Bounded simplex projection plus a feasible ESG repair by convex mixing."""

import numpy as np


class Constraints:
    def __init__(self, lower, upper, scores, minimum=0):
        self.lower, self.upper, self.scores = map(
            lambda x: np.asarray(x, dtype=float), (lower, upper, scores)
        )
        self.minimum = minimum
        if any(
            x.shape != (5,) or not np.isfinite(x).all()
            for x in (self.lower, self.upper, self.scores)
        ):
            raise ValueError("Expected five finite bounds and ESG scores")
        if (
            not np.isfinite(minimum)
            or (self.lower < 0).any()
            or (self.upper > 1).any()
            or (self.lower > self.upper).any()
            or self.lower.sum() > 1 + 1e-10
            or self.upper.sum() < 1 - 1e-10
        ):
            raise ValueError(
                "Infeasible allocation bounds: lower <= weights <= upper must permit sum 1"
            )
        # Linear ESG maximizer: allocate residual to highest scores under the caps.
        self.maximum_esg_weights = self.lower.copy()
        remaining = 1 - self.lower.sum()
        for i in np.argsort(-self.scores):
            delta = min(remaining, self.upper[i] - self.lower[i])
            self.maximum_esg_weights[i] += delta
            remaining -= delta
        self.maximum_esg = float(self.maximum_esg_weights @ self.scores)
        if minimum > self.maximum_esg + 1e-8:
            raise ValueError(
                f"Infeasible ESG floor {minimum:g}; maximum achievable under allocation bounds is {self.maximum_esg:.4f}"
            )

    def project(self, action):
        action = np.asarray(action, dtype=float)
        if action.shape != (5,) or not np.isfinite(action).all():
            raise ValueError("Action must contain five finite numbers")
        action = np.clip(action, 0, 1)
        # Continuous raw preferences are projected onto bounded unit simplex.
        lo, hi = -2.0, 2.0
        for _ in range(50):
            middle = (lo + hi) / 2
            if np.clip(action - middle, self.lower, self.upper).sum() > 1:
                lo = middle
            else:
                hi = middle
        weights = np.clip(action - (lo + hi) / 2, self.lower, self.upper)
        score = float(weights @ self.scores)
        if score < self.minimum:
            gap = self.maximum_esg - score
            alpha = min(1.0, (self.minimum - score) / gap) if gap > 1e-12 else 1.0
            weights = (1 - alpha) * weights + alpha * self.maximum_esg_weights
        return weights
