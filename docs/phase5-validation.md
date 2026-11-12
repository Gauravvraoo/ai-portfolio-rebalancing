# Phase 5 — final polish, testing and integration

Based on `feat/phase-4-premium-gui` at `ebd062e6d26ccafe045d346902fa9fdf08e6c4ba`. Existing React/Vite frontend, FastAPI/SQLite backend, PPO workers, accounting, constraints, synthetic datasets and model formats are preserved. No commits, pushes or merges were performed.

## Fixes

- Fixed both Vite development and preview proxies: port 8000 now matches the documented backend. `API_PROXY_TARGET` supports alternative backend locations without changing browser API URLs.
- Added bounded JSON requests, explicit network/timeout/invalid-proxy-response errors, cancellation on unmount, and clearing of stale resource data during loading. Backend validation errors remain visible; failures never substitute made-up financial results.
- Replaced overlapping training interval polls with completion-based scheduling. Poll errors retain their recovery controls and block submissions against stale status.
- Fixed saved-run selection when only the comparison URL query changes. Refresh active backtest summaries even when another saved run is selected, preventing permanently disabled run controls after background completion.
- Graceful API shutdown stops owned worker processes. Startup marks interrupted jobs failed with a recovery message while preserving artifacts and completed results. Tests verify restart recovery and worker cleanup. This follows the existing single-API-process operating model.
- Added frontend request/error/cancellation/timeout regression tests and browser integration checks covering the production preview proxy, training API outage/recovery, query-only source navigation and background list refresh.
- Added optional `SCREENSHOT_DIR` for GUI validation so rerunning audits need not overwrite Phase 4 screenshots. Added a demonstration checklist and updated interruption/proxy documentation.

## Verification

Executed on Linux with Python 3.12.14, CPU PyTorch 2.6.0, Node 24.22.1 and system Chromium. Dependencies installed from existing lockfiles/pins; TLS and integrity verification remained enabled.

- Backend: `python -m pytest -q` — 54 tests passed. Includes actual independent PPO optimization, changed learned policy parameters, deterministic held-out evaluation, constraint feasibility, risk/return arithmetic, four/six-strategy replay, accounting, exports and restart/shutdown regressions.
- Frontend: `npm test` — 8 tests passed, including five new API regressions.
- Production: `npm run build` passed. Backend health and portfolio responses verified through both development port 5173 and preview port 4173.
- `test:smoke` passed: six routes, computed allocation submission, invalid allocation blocking, baseline CSV, mobile navigation/layout, API failure and retry.
- `test:training` passed: infeasible ESG rejection, real two-agent Quick training, learning curves, actual held-out evaluation, persisted reload and mobile layout.
- `test:backtesting` passed: real four/six-strategy runs, ESG overlay, metrics table, strategy filters/chart zoom, allocation history, three exports, persisted reload, baseline comparison, mobile layout and failure/retry.
- `test:gui` passed: 18 route/viewport checks at 1440/820/390px, 12 axe WCAG A/AA audits with zero violations, calculated dashboard values/activity, filters, allocation export, report exports, source links, keyboard focus trap/Escape and honest empty states. Screenshots saved outside the checkout under `/tmp/verdant-phase5-screenshots`.
- `test:integration` passed: built SPA/preview proxy, training API failure/recovery, same-mounted-page saved-run query navigation and background completion while viewing an older run.
- `npm audit` reported zero vulnerabilities. `git diff --check` passed.

## Boundaries and remaining limitations

All prices remain synthetic and ESG scores illustrative; this validates application behavior, not real-market profitability or ESG impact. Quick PPO verifies integration rather than convergence. No live market data, vendor ratings, trading credentials or external service is required.

The local job manager still requires one API process. Interrupted jobs are failed rather than resumed. Forced API termination can leave orphan workers until machine termination; distributed deployment, authentication and production job orchestration remain future work. Existing Gymnasium observation-space warnings and a Starlette/AnyIO deprecation warning do not fail tests.

Playwright's browser download was denied by the environment network policy, so browser verification used the available `/usr/bin/chromium` via `CHROMIUM_PATH`; no repeated manual download retries or verification bypasses were used. npm's default cache was unavailable, resolved by using `/tmp/verdant-npm-cache`. These are environment-specific setup details, not application failures.

Windows/macOS execution, Firefox/Safari, formal screen-reader certification, Standard-mode convergence and real-market performance were not tested. Automated accessibility checks supplement manual keyboard and visual review.

## Repeat the browser checks

Start the backend on 8000 and frontend development server on 5173 as described in README. Build the frontend and start preview on 4173. Then from `frontend`:

```bash
npm test
CHROMIUM_PATH=/usr/bin/chromium npm run test:smoke
CHROMIUM_PATH=/usr/bin/chromium npm run test:training
CHROMIUM_PATH=/usr/bin/chromium npm run test:backtesting
CHROMIUM_PATH=/usr/bin/chromium SCREENSHOT_DIR=/tmp/verdant-phase5-screenshots npm run test:gui
CHROMIUM_PATH=/usr/bin/chromium npm run test:integration
```

The integration suite expects at least two real saved backtests, created by the backtesting suite. Its additional run uses the real backend. For a Playwright-managed browser installation, omit `CHROMIUM_PATH`.
