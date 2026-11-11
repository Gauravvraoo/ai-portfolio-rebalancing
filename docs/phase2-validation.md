# Phase 2 validation and review notes

The existing Phase 1 dashboard, API calculations and sample SQLite data are preserved. Phase 2 adds a separate Gymnasium environment, two independently initialized/trained Stable-Baselines3 PPO agents, bounded/ESG allocation repair, self-financing execution, chronological holdouts, persisted artifacts and API-launched worker processes. The training page now runs actual experiments and evaluations.

## Verified in the Linux cloud environment

- **26 backend tests passed**, including all 8 Phase 1 tests.
- The integration test launches real Quick-mode PPO subprocesses, checks both saved policies changed from initialization, confirms independent parameters, and evaluates the selected checkpoints on the held-out test interval. Repeated deterministic evaluation returns identical histories and does not modify model files.
- Environment tests cover reward terms, constraints and infeasibility, fees/slippage, cash compounding, drift/turnover, Gymnasium API compliance and terminal behavior.
- Leakage checks mutate future data and confirm earlier features/rewards and the entire train trajectory remain unchanged. Chronological realized-return intervals are disjoint.
- **Frontend production build passed.**
- The existing six-route browser smoke test passed, including baseline simulation, invalid weights, CSV export, mobile navigation and API failure/retry.
- The new browser test runs an actual two-agent Quick job through the GUI, verifies infeasible-setting errors, completion polling, computed learning charts, held-out evaluation, persisted results after reload and mobile overflow checks. No browser exceptions were observed.
- `pip check` reports no broken requirements; `npm audit` reports zero vulnerabilities.

Warnings: Starlette's test client emits an AnyIO deprecation warning. Gymnasium's checker notes that the observation Box permits unbounded values; returns/turnover are intentionally not arbitrarily clipped. These are warnings, not failed checks.

## Limits of this evidence

- Tests use explicitly synthetic prices and illustrative ESG assumptions. They validate implementation behavior, not investment returns or real-world ESG impact.
- Quick mode is verified. Standard 8,192-step training, convergence, real-market performance and Windows execution were not verified.
- Constraints apply to rebalance targets. Price drift can move subsequent holdings outside them; risk settings are reward penalties rather than hard risk limits.
- This is a single-API-worker local research job manager, not a distributed/resumable queue. Keep the API running during training; forced termination can leave unfinished job state. No public-service authentication is implemented.
- Generated experiment/model files are saved in the ignored `backend/experiments` directory, not committed to Git. Each fresh user experiment produces its own actual results.

The feature branch is based on the Phase 1 foundation branch. At implementation time, remote `main` still contained only the initial README, so a PR targeting `main` also includes the Phase 1 prerequisite commit. Do not merge/reset either branch merely to hide that dependency.
