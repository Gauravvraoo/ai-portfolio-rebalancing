# Real historical market data — implementation and validation

Base: `feat/windows-one-click-launcher` at `069f75a1401bbb0822e21b09becde26dddb51807`.
Feature branch: `feat/real-historical-market-data`. No merge into main.

## Implemented workflow

A persistent GUI source selector controls Market Analysis and new research jobs: Synthetic Demo or Real Historical Market Data, with 1Y/3Y/5Y ranges and assumed cash yield. Synthetic monthly dashboard KPIs, allocation studio and original report remain separate and explicitly labeled. Historical dashboard context, saved-run activity and report selectors identify their own sources.

The backend fetches SPY/AGG/GLD/QQQ through yfinance adjusted daily history. CASH is not requested from Yahoo. Daily series use an observed-date intersection with no forward/backfill and exclude the current UTC date to avoid partial bars. Prices must be positive/finite with at least 150 complete observations. Market returns normalize adjusted closes; volatility/correlations use aligned returns. Constant-return CASH correlations are undefined. Real source failures remain errors and never invoke demo fallback. Cache lifetime is six hours; refresh requests within 60 seconds coalesce and provider errors have a 60-second cooldown. Metadata distinguishes retrieval time from trading dates; no intraday quote time or streaming prices are claimed.

PPO retains the existing causal observations, chronological train/validation/test realized-return splits, validation-only model selection, explicit held-out evaluation, independent agents and CPU workers. Each job stores source, universe, adjustment, requested/actual range, retrieval time, split boundaries, settings, snapshot and checksum. Training/evaluation and backtesting verify snapshot integrity. Legacy artifacts default to synthetic without being rewritten. Models are filtered in the GUI and rejected by the API on source/range mismatch; model comparisons use the exact original immutable snapshot rather than fetching new data. All six strategies share its evaluation period, costs, cash yield, schedule and explicit ESG policy. ESG remains illustrative.

Advanced JSON and CSV exports include source/provider, universe, dataset dates/hash/adjustment, configuration and educational disclaimers. JSON retains full training settings, bounds and histories; CSV additionally includes serialized backtest/training configurations and bounds. Existing models/datasets/experiments are not migrated or replaced. Both Windows launcher source files are unchanged.

## Checks executed on Linux

- Backend: **64 pytest tests passed**, including 54 prior tests and 10 new market-data tests.
- New backend tests: yfinance adjusted-history argument contract; observed calendar intersection; CASH-not-ticker behavior; price/cache statistics; refresh coalescing; provider empty/error/rate limits; validation; explicit no-fallback behavior for expired cache; source/splits/snapshot metadata; source/range mismatch; immutable snapshot reuse; legacy model compatibility; real-source worker replay and provenance-bearing exports. Provider responses are controlled fixtures, not external downloads.
- Frontend: **11 unit tests passed**, including three source/legacy-model/range/request regressions.
- Launcher: **7 portable tests passed**. `START_PROJECT.bat` and `scripts/windows_launcher.py` have no changes relative to the base branch.
- Production Vite build passed; pip dependency consistency check passed. Git whitespace checks passed.
- Original browser smoke suite passed: six routes, allocation, invalid weights, CSV, mobile navigation/layout and API retry.
- Original training suite passed with genuine Quick PPO optimization, charts, held-out evaluation and reload persistence in Synthetic Demo.
- Original backtesting suite passed: genuine four/six-strategy replay, ESG overlay, table, chart controls, allocations, three exports, persistence, baseline tab and failures/retry.
- Original GUI suite passed: **18 page/viewport checks**, **12 axe WCAG A/AA audits with zero violations**, keyboard drawer, calculated KPIs/activity, report/source links, controls and honest empty states. Updated its synthetic source-label expectation to the new explicit mode name. Screenshots were written outside the repository.
- Integration suite passed: built SPA/preview proxy, training outage/recovery, query-only saved-run navigation and background list refresh.
- New historical-mode browser suite passed: source/range/manual refresh and failure recovery; actual PPO training/evaluation; six-strategy replay with matching experiment checksum; source mismatch rejection and model filtering; dashboard baseline separation; saved report exports; mobile overflow checks; **10 axe audits with zero violations**. No browser exceptions were recorded.

## Evidence limits

The first actual yfinance request failed with a Cloud proxy **CONNECT 403** before Yahoo access. The API returned 503 and an explicit no-synthetic-fallback message. Required Yahoo host additions were saved in an environment draft, requiring review/save and publication; no successful external Yahoo download or applied network-policy change is claimed.

Browser success paths used the explicit `backend/scripts/run_market_fixture_server.py` harness. It prints and exports `Controlled provider fixture (not a Yahoo download)`, isolates its database/cache/models/results in an OS temporary directory, and is never imported by normal application/launcher startup. It replaces the provider fetch and labels its metadata in this test process; real PPO workers, evaluation, API calls, accounting, exports and replay execute normally. This tests integration and error paths without presenting synthetic fixtures as fetched market history. The fixture server was stopped after validation.

Windows console/browser/process execution, actual Yahoo availability, provider data quality, Firefox/Safari and formal screen-reader certification remain unverified here. Yahoo access on a local Windows machine depends on its own network and provider availability. Do not disable TLS checks to bypass access problems. Yahoo history can be revised and is not point-in-time research data; static illustrative ESG is not verified ESG. Quick training checks the pipeline, not convergence or future profitability.

## Reproduce

Follow README installation and startup instructions. Existing backend/frontend checks are unchanged. For provider-independent historical GUI tests, start the explicit isolated fixture harness on 8000, Vite on 5173, and run `npm run test:real-market` from frontend. Install Playwright Chromium, or set `CHROMIUM_PATH` to system Chromium. Use the normal backend rather than the harness to verify actual Yahoo connectivity when allowed; the suite prints the provider used. Stop existing servers before starting a replacement. No production fallback or hidden test endpoint exists.
