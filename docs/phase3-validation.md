# Phase 3 implementation and verification

Phase 3 extends commit `f3b4969` on the Phase 2 branch. Its ancestry includes Phase 1 commit `a537ba7`; neither foundation was omitted or reset.

## Completed

- Separate historical replay subsystem with background jobs, immutable dataset/model snapshots, checksums, saved settings/results and error reporting.
- Buy-and-hold, equal-weight, rolling mean–variance and momentum benchmarks, plus saved profit and responsible PPO policies.
- Shared execution kernel used by PPO environments and all backtests, including self-financing fees/slippage, simulated cash interest, drift and exact non-trading holds.
- Common test clocks, initial capital, economic settings and scheduled rebalancing; buy-and-hold intentionally trades only initially.
- All requested metrics, null handling for undefined ratios and end-holding weighted illustrative ESG.
- Connected comparison page with cumulative/drawdown range charts, strategy visibility controls, risk–return scatterplot, selectable allocation history and computed results table.
- Initial capital, calendar frequency, fees/slippage, ESG scope/threshold and advanced period/estimation/economic controls.
- Full JSON, summary CSV and daily-history CSV exports of actual saved results.
- Original comparison tab, report API, SQLite baseline and training UI remain functional.

## Executed checks

- `python -m pytest -q`: **52 passed** (all 26 Phase 1/2 tests plus 26 Phase 3 tests).
- Real Quick-mode subprocess training occurred in integration tests. Both saved PPO models were replayed through the new engine.
- Daily PPO equity histories and fees match Phase 2's evaluator at identical settings, with unchanged model artifacts.
- Metric formulas were independently checked, including Sortino/Calmar, zero denominators, cash, capital scaling, drift, costs and turnover.
- Each benchmark has unit coverage and real replay/API integration coverage. All three calendar schedules execute in tests.
- Leakage tests mutate future prices without changing earlier actions/accounting; training/validation date requests and dataset checksum mismatches are rejected.
- Worker launch failures, invalid settings/IDs, unfinished exports and actual CSV/JSON contents are tested.
- Frontend production build passed.
- All three browser suites passed: existing navigation/simulation/report smoke test, actual two-agent training/evaluation test, and new four/six-strategy backtesting test. The latter verifies table results, visibility/zoom, allocation selection, exports, reload persistence, mobile overflow, the baseline tab and API failure/retry. No browser exceptions were observed.
- `pip check`: no broken requirements. `npm audit`: zero vulnerabilities.

Non-failing test warnings include the existing AnyIO deprecation and Gymnasium's unbounded observation Box notices. SciPy SLSQP also warns when trial optimizer steps are clipped back into bounds; final executed allocations are constrained and tested. Solver failures are surfaced rather than hidden by fallback performance.

## Limits

Prices are the existing reproducible synthetic fixture; ESG scores and cash yield are simulated assumptions. No results establish real investment performance. Annualization of the short test interval is extrapolation. The engine deliberately restricts comparisons to the held-out test period; this phase does not add walk-forward selection, real-market ingestion, corporate actions, dividends, taxes, borrow/shorting or volume-dependent impact.

ESG applies to Responsible PPO by default; an explicit common overlay can apply it to every strategy. Allocation/ESG constraints apply at trades, with drift allowed between trades. Altered execution schedules/costs/floors are inference scenarios and do not retrain PPO. Repeated test-driven tuning invalidates an untouched-holdout interpretation.

Quick PPO and the synthetic Linux workflow are verified. Standard-mode convergence, Windows execution and real-market behavior were not tested. Backtesting uses a single API-worker local process manager; live jobs are not resumed after forced termination or snapshot restoration. Generated models and results are stored in ignored artifact directories, not Git.
