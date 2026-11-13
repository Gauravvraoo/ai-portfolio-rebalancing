# Verdant — AI Portfolio Rebalancing with Risk and ESG Constraints

Phases 1–5 of a B.Tech CSE final-year project: an educational portfolio simulation application. React + Vite + Tailwind CSS + Recharts frontend, FastAPI backend, and SQLite storage.

**No live trading, streaming quotes or verified vendor ESG ratings.** Synthetic Demo remains the default. Optional **Real Historical Market Data** downloads split/dividend-adjusted daily ETF closes from Yahoo Finance via yfinance. Prices are historical observations, never advertised as live. PPO uses genuine Gymnasium/Stable-Baselines3 models; research results do not establish future investment performance.

Market Analysis uses historical datasets only; there is no live ETF watch or streaming market-data connection. Its data-source controls stay on Market Analysis. Training and Strategy Comparison retain source/range selectors inside their own configuration forms. The shared **API connected** indicator reports FastAPI/SQLite health, not market-provider connectivity.

See [Historical Market Analysis](docs/historical-market-analysis.md) for the current data flow and verification steps.

## Requirements

- Python 3.11–3.12 (verified with Python 3.12; use a version supported by the pinned PyTorch wheels)
- Node.js 22+ and npm (verified with Node 24)
- Two terminals, or the Windows launcher after dependency installation
- Synthetic Demo and Yahoo need no API key; optional Tiingo requires an API key and suitable data access. Historical providers require outbound HTTPS. Synthetic Demo works offline after installation.

## Run on Windows PowerShell

From the repository root, in terminal 1:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In terminal 2, from the repository root:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Open the frontend at the address Vite prints (normally port 5173). Using the virtual environment executable directly avoids PowerShell activation-policy changes. Stop services with Ctrl+C.

Check the backend in another PowerShell terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

## Windows one-click launcher

After completing the Windows dependency installation above once, double-click **`START_PROJECT.bat`** in the repository root. You can also run `.\START_PROJECT.bat` from PowerShell. No administrator access is needed. The launcher uses this repository's existing `.venv\Scripts\python.exe` and `frontend/node_modules`; Node.js 22+ must be on PATH. It does not install dependencies or replace environments.

The launcher supports repository paths containing spaces. It checks ports **8000** and **5173** before starting anything and refuses occupied/unavailable ports; it never stops an existing service or silently switches ports. Stop your existing development servers first. It runs one FastAPI process on `127.0.0.1:8000` and Vite on `localhost:5173` with strict port selection. For its child processes only, it sets `API_PROXY_TARGET=http://127.0.0.1:8000`, avoiding inherited proxy-port mismatches.

Before opening **http://localhost:5173** in your default browser, it verifies backend database health, the Vite application response, and backend health/portfolio data through Vite's API proxy. Startup waits up to 90 seconds per service, with bounded HTTP requests and early detection of child-process failure. If opening the browser fails, open the address manually.

**Keep the launcher window open. Press Q or Ctrl+C in that window to shut down.** This requests shutdown of only the process groups started by this launcher, allowing FastAPI to stop its training/backtest workers. If a service does not stop within 30 seconds, the launcher force-stops that owned process tree. Avoid the window's X button or Task Manager for normal shutdown: abrupt console termination cannot guarantee cleanup. Stop or finish experiments before shutting down; interrupted jobs are marked failed on the next backend startup, with artifacts retained.

Backend and frontend output is saved in a unique `%TEMP%\verdant-launcher-*` directory printed at startup. Startup/runtime errors stop owned services and leave an error message visible. Missing dependency errors point to the manual setup instructions. Logs are retained for troubleshooting. Existing datasets, models and experiments are not deleted or replaced; normal backend startup/operation retains its existing database initialization and interrupted-job recovery behavior.

Portable launcher checks: `python -m unittest discover -s scripts -p test_windows_launcher.py`. These cover occupied ports, real HTTP/proxy readiness, failure/timeout handling and owned-process cleanup. **Windows-specific execution still needs local verification**, especially double-click launch from a path with spaces, browser opening, Q/Ctrl+C cleanup, and occupied-port refusal. Linux checks cannot certify Windows console/process behavior.

## Run on Linux / macOS

```bash
python3 -m venv .venv
.venv/bin/python -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python -m pip install -r requirements.txt
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite forwards `/api` to port 8000. Start both processes; a frontend alone cannot calculate results. `npm run preview` also proxies to the backend for local build verification. For deployment, configure an HTTPS reverse proxy serving the built SPA with history fallback and forwarding `/api` to FastAPI. Development CORS accepts only localhost/127.0.0.1 on port 5173.

## What works

- Responsive dark dashboard, mobile sidebar, reusable cards, tables, and charts
- Market analysis for SPY, AGG, GLD, QQQ and CASH
- Editable long-only allocation simulation with server-side validation
- Balanced, Defensive and Growth strategy comparison using the same data and methodology
- CSV report download generated by the API
- Loading, retry, API health and error states
- Actual asynchronous two-agent PPO training, job status, computed learning curves and held-out evaluation
- Historical replay with four benchmarks and both PPO policies, common execution, complete metrics, interactive charts and CSV/JSON exports

The Phase 1 rebalancing page still evaluates **starting weights followed by buy and hold** and does not persist custom allocations or place trades. The separate AI Agent Training page performs actual daily simulated rebalancing with allocation/ESG constraints and risk penalties.

## Sample data and calculation methodology

`backend/data/sample_prices.csv` contains 65 **synthetic** prices: five assets at 13 monthly dates from 2023-12-31 to 2024-12-31. Numbers were constructed for a reproducible educational example; they are not downloaded historical observations or investment evidence. CASH stays at $1 and earns zero interest. GLD is represented as a synthetic price series, not a live gold quote.

The seed assigns **illustrative, manually chosen ESG scores** on a 0–100 scale: SPY 68, AGG 73, GLD 45, QQQ 64 and CASH 50. These are not researched sustainability ratings; CASH's score is an arbitrary placeholder with no sustainability interpretation.

Baseline starting weights: SPY 35%, AGG 25%, GLD 15%, QQQ 20%, CASH 5%. All strategies start with $100,000, allow fractional shares and hold the initial quantities. Prices are USD-like illustrative units.

- Initial shares = capital × starting weight / initial price.
- Portfolio value = sum of shares × current sample price.
- Total return = (final value / initial capital − 1) × 100.
- Annualized volatility = sample standard deviation of 12 monthly portfolio returns × √12 × 100. This is an estimate from a very small sample.
- Maximum drawdown = minimum of (value / running peak − 1) × 100, measured at monthly observations only.
- Current weights reflect price drift. ESG score = sum of current weight × illustrative asset score at the end date.

Calculations exclude fees, slippage, taxes, dividends, interest, inflation and intramonth losses. Displayed values are rounded only for presentation (chart/CSV values to cents); calculations retain precision. Synthetic returns do not establish investment performance.

## Database

The backend lifespan initializes and idempotently seeds SQLite on startup. Default file: `backend/data/portfolio.db` (ignored by Git). Tables: `assets` and `prices`, with `(date, symbol)` as the price primary key. No database server is needed. To override the location before starting the backend:

```powershell
$env:PORTFOLIO_DB_PATH = "C:\path\portfolio.db"
```

Existing seed records are preserved. To reload changed sample fixtures, stop the backend and remove only the generated database, then restart. Do not delete a database containing data you intend to retain. This phase has no migration framework or production persistence guarantees.

## API

Interactive OpenAPI documentation is available on backend `/docs`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Actual SQLite connectivity |
| GET | `/api/portfolio` | Baseline summary, holdings, history and methodology |
| GET | `/api/market` | Sample asset metadata and normalized return series |
| POST | `/api/simulate` | Compute custom starting allocation |
| GET | `/api/strategies` | Compute three preset portfolios |
| GET | `/api/report` | Baseline CSV export |

Simulation payload:

```json
{"weights":{"SPY":0.35,"AGG":0.25,"GLD":0.15,"QQQ":0.20,"CASH":0.05}}
```

Supply all five assets with finite weights from zero to one, summing to one (tolerance 0.000001). Invalid input returns HTTP 422.

## Validation

Linux/macOS, from the repository root:

```bash
cd backend
../.venv/bin/python -m pytest -q
cd ../frontend
npm run build
```

Windows PowerShell, from the repository root:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q
Set-Location ../frontend
npm run build
```

Tests cover SQLite seed idempotence, CSV-derived valuation, return, volatility, drawdown, weighted ESG, cash-only simulation, invalid weights, market data, strategy comparison and CSV exports. Browser verification should additionally cover all six routes, mobile navigation, API failure/retry, custom simulation and report download. Windows commands are supplied for portability but require execution on Windows for platform-specific verification.

## Architecture and next phases

```text
backend/
  app/main.py                FastAPI transport and allocation validation
  app/database.py            SQLite setup and seed ingestion
  app/services/portfolio.py  Framework-independent calculation engine
  app/rl/                    PPO environment, constraints, jobs and workers
  data/sample_prices.csv     Explicitly synthetic fixtures
  tests/test_api.py           API and financial calculation tests
frontend/
  src/App.jsx                Routed pages and responsive application shell
  src/api.js                 Real HTTP requests and loading/error lifecycle
  src/components/UI.jsx      Shared cards, charts, holdings and status UI
  src/styles.css             Tailwind and dashboard design system
```

Future work: point-in-time licensed data, walk-forward evaluation, benchmark-relative attribution, hard risk limits and production job infrastructure. PPO jobs are already separate from HTTP request handling; do not interpret synthetic training outcomes as evaluated real-world predictions.

Each cloud task already has an isolated checkout; use the existing checkout rather than creating a worktree unless requested. Restart both backend and frontend processes after restoring a cloud snapshot.

Educational backtesting only. Not investment advice.

### Automated browser smoke test

With both servers running, from `frontend`:

```bash
npx playwright install chromium
npm run test:smoke
```

This checks all six routes, allocation submission and validation, CSV download, mobile navigation/overflow, and API failure/retry. If Chromium is already installed, set `CHROMIUM_PATH` to its executable path to reuse it instead of downloading. PowerShell: `$env:CHROMIUM_PATH = "C:\path\chrome.exe"`. The smoke runner is for local development and requires ports 5173 and 8000.

## Phase 2: genuine PPO portfolio optimization

Install the CPU PyTorch wheel **before** installing `requirements.txt`, as shown above; this avoids downloading CUDA libraries on Linux. Gymnasium 1.1.1 and Stable-Baselines3 2.6.0 are pinned. First installation downloads roughly 200 MB for CPU PyTorch plus dependencies. No GPU, API key or live feed is required.

Start the backend and frontend as documented above. Open **AI Agent Training**, choose Quick mode, configure costs/bounds/ESG, and click **Train both PPO agents**. The API returns HTTP 202 immediately. Training runs in a separate Python process using one PyTorch CPU thread and two independent PPO instances (seeds `seed` and `seed+1`). Status and charts update every two seconds. Once both agents are trained, click **Evaluate saved models on test split**. Evaluation also runs outside the HTTP request lifecycle. Reloading the page restores persisted experiment results.

- **Quick:** 512 optimizer-interaction steps per agent, intended only as a CPU-friendly end-to-end sanity check.
- **Standard:** 8,192 steps per agent; still a small research demonstration, not a claim of convergence.
- PPO uses MLP layers `[32,32]`, rollout length 128, minibatch 64, 5 optimization epochs, learning rate 0.0003, and SB3 defaults for remaining PPO parameters. Each 128-step checkpoint is measured **after its optimizer updates**. The checkpoint with the greatest sum of validation rewards is saved for test evaluation; final models are also retained separately.
- "Profit PPO" maximizes growth subject to configured volatility/drawdown/cost penalties and allocation bounds, without an ESG floor/penalty. "Responsible PPO" adds an ESG floor and an ESG penalty on its proposed allocation. There is no shared policy, optimizer, rollout buffer or model between agents.

### RL data and chronological protocol

The original 13-month Phase 1 fixture and all its calculations remain unchanged. RL uses `backend/data/rl_sample_prices.csv`: **780 seeded synthetic weekday closes** starting 2022-01-03 for the same five assets. These are not sourced historical prices, exchange calendars, or a claimed backtest. The generator (`backend/scripts/generate_rl_fixture.py`) uses Python's seeded `Random(202602)` with a correlated stochastic factor and smooth synthetic drift regimes. Regenerate with `python backend/scripts/generate_rl_fixture.py` only when intentionally replacing the research fixture. Its output is checked into Git.

After a 20-return observation warmup, 759 realized returns split chronologically into **455 train, 152 validation, 152 test** transitions. A split's decision start close is context for its first next-close return. Splits share boundary closes but **never share a realized return**. Validation/test trailing observations can use earlier known history. Training episodes reset only within the train interval; validation/test start independently with $100,000 cash. No full-dataset normalization, shuffled split or fitted scaler is used. The complete fixture is snapshotted per job with a SHA-256 manifest. Test prices are never passed through training environments or checkpoint scoring; the test interval runs only on explicit Evaluate. Repeated evaluation or tuning based on test results invalidates its use as an untouched holdout.

Observation at known close `t`, in fixed SPY/AGG/GLD/QQQ/CASH order (130 float32 values):

1. Last 20 daily returns including the return ending at `t` (100 values).
2. Trailing sample volatility, compounded 20-return momentum, 21-close asset drawdown (5 each).
3. Current drifted weights and illustrative ESG scores divided by 100 (5 each).
4. Current portfolio drawdown magnitude, previous execution cost fraction, cumulative turnover, fee rate and slippage rate (5 values).

No volume, sentiment, macro feeds or fabricated external indicators are available. Momentum/drawdown/volatility are computed from the available prices. An action at `t` rebalances at that known close, then receives return `t → t+1`. There is no same-step future return in the observation.

### Actions, constraints and accounting

Raw continuous five-dimensional actions are bounded to [0,1] by SB3 and projected onto the bounded unit simplex. This guarantees nonnegative target weights summing to one. Minimum/maximum weights are configurable for every asset, defaulting to 2% minimum CASH and 60% maximum per asset. Before jobs launch, bounds are validated and the maximum achievable weighted ESG is computed by allocating remaining capacity to the highest-scored assets. Infeasible bounds/floors return HTTP 422 with the achievable ESG ceiling; no training job is created.

Responsible targets below the floor are mixed with this maximum-ESG feasible allocation until the floor is met. This is a deterministic feasibility repair, **not a claim of solving a globally optimal constrained allocation**. Constraints apply at rebalance time; next-close price drift may temporarily violate bounds or the ESG floor until the next rebalance. Initial state is all cash and can lie outside configured trading bounds; the first action is constrained and pays transaction costs. No hard volatility/drawdown limit is claimed: those are reward penalties.

Let pre-trade dollar holdings be `h`, wealth `V`, and feasible target `w`. Solve by bisection for post-cost capital `X`:

```text
traded_notional = 0.5 × sum(abs(X × w − h))
X + (fee_rate + slippage_rate) × traded_notional = V
next_holdings = X × w × (1 + next_asset_returns)
next_value = sum(next_holdings)
next_weights = next_holdings / next_value
turnover = traded_notional / V
```

This explicitly charges the first rebalance and subsequent drift correction, allows fractional holdings, and fully funds costs without borrowing. The one-way turnover convention includes all five assets, including cash; fees/slippage are linear assumed rates applied to that notional. There is no volume/impact model. Cash uses the configured constant simulated annual yield compounded with 252 periods per year (default 2%); this overrides the flat CASH quote in the RL return stream only. Phase 1 cash remains zero-return.

Illustrative ESG assumptions remain SPY 68, AGG 73, GLD 45, QQQ 64 and CASH 50; these values have no vendor/researched provenance. An ESG-constrained simulated allocation is not evidence of responsible real-world impact.

### Reward and reported metrics

```text
reward = log(1 + net_portfolio_return)
       − risk_penalty × trailing_target_portfolio_daily_variance
       − drawdown_penalty × current_portfolio_drawdown_magnitude
       − cost_penalty × execution_cost_fraction
       − esg_penalty × max(0, floor − proposed_ESG) / 100   [responsible only]
```

The variance estimate uses only trailing known returns before the trade. Net return already includes actual execution costs; the additional cost term intentionally discourages turnover further. The ESG penalty uses the proposed allocation after bound projection but **before** ESG repair, so it provides a learning signal even though executed targets satisfy the floor. Every reward component is saved in evaluation histories. Coefficients default to risk .5, drawdown .1, extra cost 1 and ESG .5; all are configurable in the GUI/API. Scores are static simulated assumptions.

Training charts show actual mean rollout rewards and validation returns. Held-out charts show computed portfolio value. Evaluation saves total return, annualized daily volatility (sample standard deviation × √252), zero-rate Sharpe (null when volatility is zero), maximum drawdown, fees, slippage, cumulative one-way turnover and mean/minimum target ESG. Test episodes reset their own wealth/peak/holdings; no training profits carry into them. No dividends, taxes, real execution or performance guarantees are modeled.

### API, persistence and operation

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/training/data` | Dataset provenance and exact split dates |
| POST | `/api/training/jobs` | Validate settings and start both independent agents |
| GET | `/api/training/jobs` | Persisted experiment list with metrics |
| GET | `/api/training/jobs/{id}` | Status, progress, errors and results |
| POST | `/api/training/jobs/{id}/evaluate` | Evaluate saved selected models on the test interval |

Minimal training payload: `{"mode":"quick","seed":7,"min_esg":65}`. Other fields are documented in `/docs` (`fee_bps`, `slippage_bps`, `cash_annual_return`, five-element `min_weights` / `max_weights`, and the four reward coefficients). Job states: queued → running → trained → evaluating → completed, or failed. Status and launch errors are surfaced in the GUI. HTTP 409 rejects overlapping operations or premature evaluation.

Artifacts are written under `backend/experiments/<uuid>/` (Git-ignored): `config.json`, `dataset.npz`, `job.json` (manifest, versions, metrics, histories), `profit.zip`, `responsible.zip`, both `_final.zip` models, per-agent `_metrics.json`, `evaluation.json` after evaluation, and `worker.log`. Use `PORTFOLIO_EXPERIMENT_DIR` to override this directory. Atomic JSON replacement prevents partial status reads. SQLite continues serving the unchanged Phase 1 asset and price tables; RL snapshots and artifacts are filesystem-backed and independent of the baseline database.

**Local research operation:** run one Uvicorn worker (the documented default); do not use multiple API workers or several API instances against the same artifact directory. Only one experiment operation is admitted at a time. Keep the API process running while jobs execute. Interrupted workers report failure when their process exit is observed; forced machine termination can leave an unfinished status. Models/configs/results are retained; live processes do not survive cloud snapshot restoration. This is not a distributed, resumable production queue. Model files are trusted locally generated artifacts and must not be replaced with untrusted zip/pickle content. No authentication is included; do not expose training endpoints publicly without adding access controls and resource limits.

### Phase 2 verification

From the repository root:

```bash
.venv/bin/python -m pytest -q
npm run build --prefix frontend
```

PowerShell equivalent:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm run build --prefix frontend
```

Tests include actual subprocess PPO training, confirmation that saved policy parameters changed from initialization, independent models, real held-out evaluation and repeatability, reward decomposition, Gymnasium's environment checker, feasible/infeasible ESG/weight constraints, self-financing fees/slippage, cash compounding, drift, turnover, episode termination, future-data mutation and non-overlapping return splits. The integration test runs Quick mode and has a 180-second timeout per operation.

With both servers running, from `frontend`:

```bash
npm run test:smoke
npm run test:training
```

The second browser test starts a genuine two-agent Quick job, polls completion, evaluates it, verifies learning/evaluation charts, reload persistence and mobile layout, and checks infeasible-setting error handling. It writes screenshots to the OS temporary directory. Use `CHROMIUM_PATH` or `npx playwright install chromium` as described above. These tests intentionally retain their generated experiments for inspection. Standard mode and Windows execution require separate verification when not explicitly reported as tested.

## Phase 3: advanced backtesting and strategy comparison

Open **Strategy Comparison → Advanced backtesting**. Run four benchmarks immediately or select a saved, trained Phase 2 experiment to include **both** PPO policies. The original Phase 1 comparison remains available in its own tab, and its API and calculations remain unchanged.

Configure initial capital, daily/weekly/monthly rebalancing, fees, slippage and the illustrative ESG threshold. Advanced settings expose cash yield, the risk-free metric rate, rolling estimation lookback, MVO risk aversion and optional start/end closes. The form configures a **new** run; existing charts/table/exports always retain the saved run's settings shown above them. Start a backtest, follow its real queued/running/completed/failed status, then inspect computed results. No training or invented metrics are substituted for missing PPO models.

### Strategy definitions

| Strategy | Decision rule |
| --- | --- |
| Buy & hold | Start from Phase 1's 35/25/15/20/5 SPY/AGG/GLD/QQQ/CASH mix, project to applicable constraints, trade once, then hold the quantities with cash interest. This is a diversified benchmark, not a SPY-only index. |
| Equal weight | Target 20% in each asset at each scheduled rebalance, subject to the shared bounds/optional ESG overlay. |
| Rolling mean–variance | At each scheduled close, estimate trailing mean/covariance and solve a long-only bounded quadratic objective with SciPy SLSQP: maximize `annual_mean·w − 0.5 × risk_aversion × wᵀ annual_covariance w`. Covariance uses 90% sample covariance + 10% its diagonal, plus an annualized `1e-6` diagonal ridge. Solver failure is reported as a failed backtest, never silently replaced with a different benchmark. |
| Momentum | Rank trailing compounded returns and propose 50% in each of the top two assets (cash can win), then project to applicable constraints. Stable asset order breaks ties. |
| Profit PPO | Deterministic actions from the saved validation-selected profit model, with common inference-time execution settings. |
| Responsible PPO | Deterministic actions from the saved validation-selected responsible model, with the configured ESG floor enforced at rebalance targets. |

All rolling signals end at the current known close; none include the next close. Default estimation lookback is 60 daily returns and MVO risk aversion is 5. No parameters are selected using test outcomes.

### Fairness, execution and holdout protection

Every strategy in a run uses the same dated test observations, initial all-cash capital, cash yield, trading cost rates, close-to-next-close convention, and the **same execution implementation** in `backend/app/services/execution.py`. PPO environments also call this shared kernel. Non-rebalance days use an exact hold path: no trades, cost, or accidental constraint repair. Buy & hold's one initial trade is intentional; all other strategies follow the selected common schedule. Daily trades occur at every decision close; weekly/monthly trades occur at the first observed close in the new ISO week/calendar month, plus the initial close. These closes earn the next observed close's return; they do not trade retrospectively at a period's last close. The synthetic weekday calendar is not an exchange/holiday calendar.

One-way traded notional is half the total absolute dollar changes across all five assets, including CASH, and execution solves self-financing post-cost capital as documented in Phase 2. Cash yield is an explicit annual simulated assumption, compounded at 252 periods per year. Fees and slippage are linear, with no market-volume impact, taxes or dividends. Price drift is preserved between trades.

With PPO selected, the run copies the selected experiment's immutable dataset and **both** selected model zip files into its own directory. Its dataset checksum must match the training manifest. Model SHA-256 fingerprints and the actual training config are saved with the result. There is no retraining, policy update or checkpoint selection during comparison. The fixed chronological test interval comes from that snapshot. Optional dates must be observed closes **inside this test interval**; training/validation dates are rejected. In benchmark-only mode the same test split of the checked-in synthetic fixture is used. At least two realized returns and adequate trailing history are required. A worker only supplies prices through the evaluation end close to its environments; benchmarks access only trailing slices. Future-price mutation tests verify causality.

All strategies share the selected experiment's minimum/maximum weight bounds, or Phase 2 defaults without a model. By default the ESG floor applies only to Responsible PPO; other strategies intentionally have no ESG floor. Check **Apply ESG execution overlay to all strategies** to impose the same target constraint set across all six, including profit PPO and buy & hold's initial target. Infeasible settings fail validation before a job starts. Bounds/ESG apply only at trade targets; market drift can violate them between trades. Changing fees, cash yield, schedule or ESG at inference may differ from the PPO training distribution. This is a controlled scenario comparison, not a claim that policies were optimized for every scenario. Repeated test-based tuning makes the test exploratory rather than an untouched holdout.

### Metric definitions

Let `V₀` be initial cash, `Vₙ` final net wealth, `rₜ = Vₜ/Vₜ₋₁ − 1`, `N` the number of realized daily returns, and `eₜ = rₜ − ((1 + annual_risk_free_rate)^(1/252) − 1)`.

| Metric | Computation |
| --- | --- |
| Cumulative return | `(Vₙ/V₀ − 1) × 100` |
| Annualized return | `((Vₙ/V₀)^(252/N) − 1) × 100` (geometric extrapolation, not a forecast) |
| Volatility | Sample standard deviation of net daily returns × `sqrt(252) × 100` |
| Sharpe ratio | `mean(e) × 252 / annualized_volatility_fraction` |
| Sortino ratio | `mean(e) × 252 / (sqrt(mean(min(e,0)²)) × sqrt(252))`; downside uses all days, not only loss days |
| Maximum drawdown | Minimum of `(Vₜ / running_peak − 1) × 100`, including initial cash in the peak |
| Calmar ratio | Geometric annualized return fraction / maximum drawdown magnitude fraction |
| Turnover | Sum of daily one-way traded-notional / pre-trade wealth ratios |
| Transaction costs | Actual fees plus slippage in currency; both components also reported separately |
| Weighted ESG | Arithmetic time average of daily end-holding value-weighted illustrative ESG, excluding the initial cash observation |

Undefined ratios with zero denominators are JSON `null`, blank in CSV and **N/A** in the table. Nothing is replaced with an invented finite ratio. Prices and ESG are the existing synthetic/illustrative Phase 2 fixtures. Short-sample annualization can be unstable and does not establish investment performance.

### Interactive charts and exports

- Cumulative returns and drawdowns: shared strategy visibility controls, date tooltips and draggable range selectors.
- Risk–return scatterplot: annualized return against annualized volatility for visible strategies, with tooltips and legend.
- Asset allocation: selectable strategy, stacked end-of-day weights, date tooltip and range selector. The initial observation is all cash; subsequent weights reflect trades and drift.
- Computed comparison table: all requested metrics plus separate fees/slippage and final value, with horizontal scrolling on small screens.
- **Export JSON**: full saved configuration, dataset provenance, model hashes, methodology, versions, metrics and all daily records.
- **Export metrics CSV**: computed summary per strategy, labels/period/initial capital and ESG constraint indication.
- **Export history CSV**: actual daily values, returns, drawdowns, trade flags, fees, slippage, turnover, ESG and all five end weights.

Exports read immutable saved results; changing the form does not silently change the downloaded backtest. The original Phase 1 report download remains on Reports.

### Backtest API and persistence

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/backtests/options` | Synthetic dataset metadata and available trained experiment IDs |
| POST | `/api/backtests` | Validate settings and launch a separate CPU replay process (HTTP 202) |
| GET | `/api/backtests` | Saved run summaries |
| GET | `/api/backtests/{id}` | Status/errors and completed computed result |
| GET | `/api/backtests/{id}/export?format=json` | Full result JSON attachment |
| GET | `/api/backtests/{id}/export?format=csv&kind=summary` | Metrics CSV attachment |
| GET | `/api/backtests/{id}/export?format=csv&kind=history` | Daily history CSV attachment |

Example body (omit `experiment_id` for four benchmarks):

```json
{
  "initial_capital": 100000,
  "rebalance_frequency": "weekly",
  "fee_bps": 10,
  "slippage_bps": 5,
  "min_esg": 65,
  "apply_esg_to_all": false,
  "cash_annual_return": 0.02,
  "risk_free_rate": 0,
  "lookback": 60,
  "risk_aversion": 5
}
```

Add a trained experiment's UUID as `experiment_id` for six strategies. `start_date`/`end_date` optionally select observed boundary closes within its held-out test interval. The complete schema is available in FastAPI `/docs`. Unknown request fields are rejected to avoid silently ignoring misspelled settings.

Artifacts are stored under ignored `backend/backtests/<uuid>/`: `job.json`, `dataset.npz`, `result.json`, `worker.log`, and copies of both models when applicable. `PORTFOLIO_BACKTEST_DIR` can override this directory (use an absolute path). Existing SQLite assets/prices and Phase 2 artifacts are preserved. Completed runs survive API/browser restart; live workers are not restored from snapshots. As in Phase 2, run a single API worker and keep it running during jobs; this is a local research process manager, not a resumable production queue. One backtest is admitted at a time. After API restart, unfinished runs are marked failed; create a new run. No authentication, real-market ingestion or walk-forward optimization is added.

### Phase 3 verification commands

The normal backend install now includes pinned SciPy 1.15.3. No separate system service is required. From the root:

```bash
.venv/bin/python -m pytest -q
npm run build --prefix frontend
```

PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm run build --prefix frontend
```

With both services running, from `frontend` (install Playwright Chromium or set `CHROMIUM_PATH` as documented earlier):

```bash
npm run test:smoke
npm run test:training
npm run test:backtesting
```

The backtesting browser suite exercises real four/six-strategy runs, infeasible settings, all three exports, table results, strategy toggles/range zoom, allocation selection, persistence, mobile layout, the original comparison tab and API failure/retry. It uses real saved PPO models or genuinely trains a Quick pair when none exist. Backend tests cover each benchmark, each metric and undefined ratios, costs/cash, calendars, causality, exports, input errors, background failures, real model replay and exact parity with Phase 2's daily PPO evaluation. Generated result/model artifacts are not committed.

## Phase 4: premium research interface

The six-page frontend now uses a unified navy/charcoal design system with blue, teal and purple accents, responsive panels, chart tooltips, consistent forms, reduced-motion support and a fixed desktop sidebar. On smaller screens, navigation opens as a keyboard-contained drawer with Escape dismissal, focus restoration and an inert background. Backend endpoints, trading conventions, original fixtures and model compatibility are unchanged.

- **Dashboard:** six baseline KPIs, value/return chart and 3M/6M/full-sample windows, allocation donut, holdings table, risk/ESG indicators and actual recent simulated trade records from the latest completed daily backtest. The activity source/strategy is labeled separately from the monthly baseline. Without a completed run, the activity panel offers an honest empty state and a working link to create a backtest.
- **Market Analysis:** API-backed asset cards/table, category filtering and per-symbol chart visibility. Prices/returns retain their synthetic-data provenance.
- **AI Agent Training:** redesigned experiment workflow, accessible progress bars, actual PPO status and learning/evaluation charts. Quick/Standard settings, constraints, error handling and background processes remain available.
- **Portfolio Rebalancing:** allocation studio with synchronized number/range controls, actual proposed-weight donut, editable presets, backend-calculated results/holdings and a JSON export of the submitted simulation. The form is disabled during a request to prevent stale input/result mismatches. This page retains the Phase 1 buy-and-hold calculation; historical scheduled rebalancing is linked separately.
- **Strategy Comparison:** redesigned setup, saved-run workspace, computed strategy table, filters, interactive cumulative/drawdown/risk-return/allocation charts and all original exports. Source links use `?run=<uuid>` to open the exact saved backtest. Phase 1 comparison remains in its own tab.
- **Reports:** research library with the original baseline CSV, selectable saved backtest JSON/metrics CSV/history CSV, real experiment metadata JSON and a saved-backtest archive. Experiment export contains only fields actually recorded by the API; model binaries remain in the artifact directory.

### Metric and activity integrity

The baseline dashboard Sharpe ratio is newly calculated **in the frontend from the API's cent-rounded monthly portfolio values**, using `mean(monthly returns) / sample_std(monthly returns) × sqrt(12)` with a clearly stated 0% risk-free assumption. It is `N/A` when undefined. Other baseline KPIs come directly from the existing backend. Chart range changes do not recompute or rebase the full-period KPI values.

Dashboard activity is not invented from the baseline holdings. It reads the latest completed backtest, selects its actual strategy history, and displays only entries with `rebalance=true`. Dates, turnover, target weights, fees and slippage come from those records. No completed backtest means no activity records. Prices remain synthetic, ESG scores illustrative, and all transactions simulated.

### Development and validation

Existing installation/run commands still apply. Refresh frontend dependencies with `npm ci` after switching to this branch. New developer-only dependencies include `@axe-core/playwright` for accessibility checks. Frontend unit tests run with Node's built-in test runner:

```bash
npm test --prefix frontend
npm run build --prefix frontend
```

With the backend and Vite frontend running, from `frontend`:

```bash
npm run test:smoke
npm run test:training
npm run test:backtesting
npm run test:gui
```

Use `CHROMIUM_PATH` or install Playwright Chromium as documented earlier. The GUI suite checks all six pages at 1440px, 820px and 390px, runs automated axe WCAG A/AA audits at desktop/mobile sizes, verifies calculated dashboard values, filters, source links, new exports, mobile keyboard behavior and honest empty states. Run the earlier workflow suites first to create actual trained models and completed backtests. It captures the final dashboard and comparison pages under `docs/screenshots/phase4/` and writes its detailed accessibility report to the OS temporary directory. Accessibility automation supplements manual keyboard/visual checks; it is not a complete assistive-technology certification.

Screenshots: [dashboard](docs/screenshots/phase4/dashboard-desktop.png), [comparison](docs/screenshots/phase4/comparison-desktop.png), [mobile dashboard](docs/screenshots/phase4/dashboard-mobile.png), [mobile comparison](docs/screenshots/phase4/comparison-mobile.png). They show actual computed synthetic-data results from the verification run, not promised financial performance.


## Phase 5: integration and demonstration readiness

Development and production-preview API proxies both default to `http://127.0.0.1:8000`, matching the backend commands above. For another backend port, set `API_PROXY_TARGET` in the shell that starts Vite, for example `API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev` on Linux/macOS. This is a server-side proxy setting; browser requests and downloads remain same-origin `/api` requests. Restart Vite after changing it.

JSON requests have a 15-second response timeout, actionable network/proxy/validation errors, and cancellation on resource unmount. Training and backtesting launch asynchronous workers; the timeout does not limit their training duration. Training status polls do not overlap. Saved comparison links also update the selected run when only the URL query changes.

Run a single backend process. Graceful API shutdown terminates owned workers; on the next startup, unfinished persisted jobs become failed with a recovery message. Completed/trained results and artifacts are retained. Interrupted jobs are not resumed; submit a new run. Forced termination can leave orphan processes until the machine stops; multi-worker deployment remains unsupported.

### Demonstration checklist

1. Start FastAPI on 8000 and Vite on 5173 using the commands above. Confirm the dashboard shows API connected.
2. Inspect the dashboard, market filters, and baseline risk/illustrative ESG values.
3. Submit an allocation totaling 100%, inspect calculated holdings, and export the result.
4. Train Quick mode, wait for both agents, then evaluate the saved models on the held-out test split.
5. Select that experiment in Strategy Comparison, run a backtest, inspect all six strategies and charts, and export JSON/CSV.
6. Open Reports, follow a saved-run source link, and verify exports. Demonstrate mobile navigation if required.

Additional regression validation (after the existing smoke/training/backtesting suites have created real records):

```bash
# From frontend; requires backend 8000, Vite 5173 and preview 4173.
npm run build
npm run preview -- --port 4173 --strictPort
# In another terminal, from frontend:
npm run test:integration
```

Set `CHROMIUM_PATH=/usr/bin/chromium` when using system Chromium on Linux. In restricted cloud filesystems, `npm ci --cache /tmp/verdant-npm-cache` uses a writable cache. The GUI suite accepts `SCREENSHOT_DIR` to keep generated screenshots outside tracked documentation. See [Phase 5 validation](docs/phase5-validation.md) for results and limitations.


## Real Historical Market Data mode

The Windows launcher and manual startup commands remain unchanged. Refresh dependencies once after switching branches:

```powershell
# Repository root; keep the existing .venv and saved artifacts.
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci --prefix frontend
.\START_PROJECT.bat
```

Root `requirements.txt` includes `backend/requirements.txt`, which pins `yfinance==1.8.0`. The CPU PyTorch installation and Python 3.11–3.12 / Node 22+ requirements above still apply for a fresh Windows setup. The default Yahoo provider needs no API token; optional Tiingo setup is documented below. Do not delete your database, experiments or backtests to upgrade. Both launcher source files are unchanged on this branch. Windows-specific execution still requires local verification.

### Use it in the existing GUI

1. At the top of any page, choose **Synthetic Demo** or **Real Historical Market Data**. The selected source persists in browser storage. Real mode offers **1Y / 3Y / 5Y** trailing calendar-year requests. Synthetic fixtures retain their original fixed dates; ranges are disabled for that mode.
2. Open **Market Analysis**. Real mode displays normalized adjusted returns, adjusted last closes, sample annualized daily volatility and a common-calendar Pearson correlation matrix. Provider, returned date range, last available trading date and retrieval timestamp identify the data. Undefined CASH correlations show N/A. The explicit cash-yield control supplies the market cash series and defaults for new research jobs; individual training/backtest forms retain their editable assumptions.
3. **Refresh market data** requests updated prices. The cache lasts six hours; repeated clicks/requests within 60 seconds reuse the freshly fetched snapshot. Rate limits have a provider-wide minimum 300-second cooldown and other failures a 60-second request cooldown, return 429/503 plus Retry-After, and show recoverable errors. Stale/failed real requests never fall back to synthetic prices. Switch to Synthetic Demo explicitly to continue offline.
4. Open **AI Agent Training** with the intended source/range selected, review costs/cash/ESG/bounds and train. Each experiment stores an immutable price snapshot, SHA-256, source/provider, symbols, requested/actual dates, adjustment convention, retrieval time, exact chronological split boundaries, PPO settings and execution assumptions. Evaluate explicitly after training. Old saved experiments have no source field and are treated as synthetic; they are never relabeled as real.
5. Open **Strategy Comparison**. Its PPO selector filters by source and, for real data, original requested range. Choose an experiment for all six strategies. The server also rejects mismatches. All six strategies use the experiment's exact snapshot and held-out interval, even if market prices have since refreshed or Yahoo revised old prices. An experiment-free run uses four benchmarks on the selected source's held-out test interval. Bounds come from the selected training configuration; costs, cash yield, calendar frequency, ESG overlay and selected test subperiod are explicit and shared by all strategies. Changing inference assumptions is exploratory and does not retrain the models.
6. **Dashboard** retains its labeled monthly synthetic baseline KPIs and allocation studio. In real mode it additionally shows active historical dataset provenance. Daily backtest activity is separately labeled by its saved run's source. **Reports** exports the selected saved result, regardless of current global source; advanced JSON/CSV includes source, universe, actual dates, adjustment, dataset checksum, full backtest configuration and educational disclaimers. Experiment JSON includes the saved training configuration/provenance. The original baseline CSV and simulation remain synthetic.

### Provider and calculation contract

- Provider: Yahoo Finance through yfinance, `Ticker.history(interval="1d", auto_adjust=True)`. Four actual tickers only: **SPY, AGG, GLD, QQQ**. Adjusted Close incorporates Yahoo/yfinance split/dividend adjustments; dividends are not added again. Yahoo historical adjustments may be revised and are not point-in-time research data. Provider availability, terms, delays and rate limits apply; there is no streaming feed or availability guarantee.
- Calendar: intersect observed ETF dates and drop incomplete rows. Never forward/backfill prices. Exclude the current UTC date from downloads to avoid partial daily bars; last returned date can therefore lag today's completed local session. At least 150 complete positive daily closes are required. Retrieval timestamp is not a quote timestamp; no intraday quote timestamp is claimed.
- Normalized asset return: `(adjusted_close / first_adjusted_close - 1) * 100`. Volatility uses sample daily return standard deviation times sqrt(252). Correlations use those same aligned returns. Monthly demo statistics use sqrt(12) and the original monthly fixture.
- **CASH is an account, never a Yahoo ticker.** Stored snapshot price is 1; the shared execution engine overrides its return with `(1 + annual_yield) ** (1/252) - 1` per observed session. Default assumed annual yield is 2%; range 0–20%. Market Analysis compounds the same assumption. No calendar-day interest, sourced deposit rate or Treasury yield is implied. The legacy monthly baseline still earns zero cash interest. Annualization uses 252 observed periods and can be unstable on short held-out samples.
- Chronology: trailing 20-return warmup, then 60% train / 20% validation / 20% test realized returns. Actions at known close t earn t→t+1 returns. Earlier history may supply trailing context; realized returns never overlap splits. Test prices are not passed into training environments or checkpoint scoring. Validation selects checkpoints, explicit evaluation alone uses test returns. Repeated test evaluation/tuning is exploratory and invalidates an untouched-holdout claim. All strategies use known history, including pre-test context for rolling estimates.
- ESG scores remain static illustrative assumptions (SPY 68, AGG 73, GLD 45, QQQ 64, CASH 50). They are not independently verified company or fund ratings. Constraints apply at trading targets; drift can temporarily exceed them. Existing soft risk penalties and all accounting conventions remain unchanged.
- Prices cache under ignored `backend/data/market_cache/` (override with absolute `PORTFOLIO_MARKET_CACHE_DIR`). Research snapshots remain in their existing experiment/backtest folders. Cache refresh never rewrites saved models, snapshots or completed results. Single API-worker operation remains required.

### Network and validation

Yahoo access may require `fc.yahoo.com`, `query1.finance.yahoo.com`, `query2.finance.yahoo.com` and `finance.yahoo.com`. TLS verification remains enabled. This cloud environment denied the first provider request with HTTP CONNECT 403. Required host additions were saved as an environment-settings draft, not applied/published access. Review/save and publish those settings before retrying a fresh Yahoo request here. A local Windows installation uses its own network policy.

Tests distinguish provider fixtures from actual external downloads. Run backend pytest, frontend unit tests and build as above. For an explicit isolated browser test with no external Yahoo dependency:

```bash
# Repository root, terminal 1. Uses temporary DB/cache/models/results only.
.venv/bin/python backend/scripts/run_market_fixture_server.py
# Terminal 2
npm run dev --prefix frontend -- --port 5173 --strictPort
# Terminal 3, from frontend (system Chromium example)
CHROMIUM_PATH=/usr/bin/chromium npm run test:real-market
```

PowerShell uses `.\.venv\Scripts\python.exe` for the harness, and `npm run test:real-market` from `frontend` after installing Playwright Chromium (`npx playwright install chromium`). Stop existing servers first. The harness prints **Controlled provider fixture** and never enables itself during normal app/launcher startup. Its tests run actual PPO optimization/evaluation and six-strategy backend replay on controlled prices; they do **not** prove a Yahoo download succeeded. The browser suite can also target the normally started backend when Yahoo is accessible; it prints the provider used. Existing smoke/training/backtesting/GUI suites continue to exercise Synthetic Demo.

Implementation evidence and test boundaries: [real-market validation](docs/real-market-validation.md).


## Historical-provider troubleshooting and Tiingo alternative

The original Windows message grouped access denials, rate limits, missing data and parsing problems together. The fix adds request IDs, distinct error codes and structured JSON diagnostic logs, and upgrades the pinned yfinance dependency to **1.8.0**. Its supported `yf.config.debug.hide_exceptions=False` setting exposes failures during timezone/bootstrap lookup as well as price retrieval; the old `history(raise_errors=True)` setting did not reliably expose the former. SDK debug dumps are suppressed in favor of safe application diagnostics. An upgrade cannot override Yahoo or proxy access restrictions.

First stop the launcher normally with Q/Ctrl+C, update dependencies, and restart:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\START_PROJECT.bat
```

If Market Analysis fails, the visible error now includes provider, symbol, reason code, corrective guidance and a request ID. The failed HTTP response includes a structured `diagnostics` object. Inspect the safe local diagnostic endpoint in a second terminal:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/api/market/diagnostics" |
    ConvertTo-Json -Depth 8
```

This endpoint does **not** contact providers. It reports provider configuration, installed Python/yfinance versions, whether a Tiingo key/proxy/custom CA is present, and recent safe failures. It never returns keys, proxy addresses/credentials, raw response bodies or request headers. Launcher logs remain under the printed `%TEMP%\verdant-launcher-*` directory; look in `backend.log` for JSON events `historical_market_data_failure` or `historical_market_data_configured_fallback`. Share the request ID and diagnostic codes, not credentials or full environment dumps. Recent failures/cooldowns are process-local; logs retain prior evidence.

| Diagnostic code | Meaning / next step |
| --- | --- |
| `proxy_denied` / `proxy_authentication` / `proxy_error` | An outbound proxy denied CONNECT (often 403), requires authentication or failed. Check the approved proxy/allowlist settings; this is separate from Vite's localhost API proxy. |
| `access_denied` | Provider 401/403: access policy, key or subscription/ETF coverage problem. Confirm access with that provider or explicitly configure another legitimate provider. |
| `rate_limited` | Provider 429: wait for Retry-After. A minimum 300-second cooldown (longer when the provider supplies Retry-After) applies across 1Y/3Y/5Y, so changing ranges does not hammer the provider. |
| `timeout` / `connection_error` / `provider_unavailable` | One bounded retry was attempted for transient network/server failure. Check connectivity, then retry later. |
| `tls_error` | Configure your organization's trusted CA correctly; TLS verification stays enabled. |
| `missing_api_key` | Configure TIINGO_API_KEY in the backend environment and restart. |
| `missing_adjusted_close` / `missing_prices` / `empty_dataset` | Provider did not return usable adjusted data. Raw closes or synthetic prices will not be substituted. |
| `invalid_prices` / `duplicate_dates` / `insufficient_history` | Invalid prices or fewer than 150 common observations after calendar alignment. Check provider coverage/date range/data plan. |
| `cache_io_error` | Check write permissions for PORTFOLIO_MARKET_CACHE_DIR; no secret path values are included in the response. |

### Use Tiingo directly when Yahoo is unavailable

Tiingo is an independent legitimate End-of-Day provider, not a Yahoo mirror. Obtain an account/API key and verify that your plan permits **daily adjusted historical prices for SPY, AGG, GLD and QQQ**, sufficient history, your intended research use and request quota. Availability and pricing depend on Tiingo; no free-access guarantee is made. See [Tiingo End-of-Day documentation](https://www.tiingo.com/documentation/end-of-day). The app uses the official `https://api.tiingo.com/tiingo/daily/{symbol}/prices` endpoint and the returned **adjClose**, not raw close. Authentication is an Authorization header, never a token in a URL. Redirects are not followed with credentials.

In PowerShell, from the repository root, after stopping existing services:

```powershell
$env:MARKET_DATA_PROVIDER = "tiingo"
Remove-Item Env:MARKET_DATA_FALLBACK_PROVIDER -ErrorAction SilentlyContinue
$secureKey = Read-Host "Tiingo API key" -AsSecureString
$env:TIINGO_API_KEY = [System.Net.NetworkCredential]::new("", $secureKey).Password
Remove-Variable secureKey
.\START_PROJECT.bat
# After quitting the launcher, optionally clear this terminal's key:
Remove-Item Env:TIINGO_API_KEY -ErrorAction SilentlyContinue
```

Enter the key only at the hidden prompt, not in Git, chat, frontend code, VITE_* variables or a literal command saved in shell history. These settings are session-local. Launch the batch file **from this same PowerShell terminal** so its backend inherits them; a separate Explorer double-click does not inherit temporary PowerShell settings. The existing launcher is unchanged. Choose Real Historical Market Data in the GUI, then refresh. Cached data retains its actual provider and retrieval time. Stop/restart after changing provider settings; do not restart repeatedly to defeat provider rate limits.

To explicitly allow Tiingo **only as a fallback** after a Yahoo failure, use the same key setup, then:

```powershell
$env:MARKET_DATA_PROVIDER = "yahoo"
$env:MARKET_DATA_FALLBACK_PROVIDER = "tiingo"
.\START_PROJECT.bat
```

No alternative is contacted unless configured. A fallback fetch downloads **all four ETFs from that provider**; data from different providers is never combined within one dataset. CASH remains a $1 snapshot account with separately applied assumed yield, never a requested ticker. The GUI shows the actual provider, explicit fallback flag and primary failure code. Provenance and JSON/CSV exports retain provider identity. Provider-policy cache namespaces prevent Tiingo configuration from serving a Yahoo cache. Existing model comparisons still replay their own immutable original dataset even when today's provider changes; the experiment dropdown includes its provider label. Saved models, experiments and snapshots are not rewritten.

Only transient timeout/connection/server errors receive one bounded retry (0.5-second delay), unless the provider supplies Retry-After; positive provider retry hints suppress immediate retries and extend the cooldown. Access denials, TLS failures, rate limits and bad data are not immediately retried. Valid caches last six hours and refresh clicks coalesce for 60 seconds. Expired prices are not silently served on failure, and real requests never fall back to synthetic data.

### Fix validation and environment boundary

Backend tests cover Yahoo API compatibility/bootstrap failures, adjusted-price parsing, legitimate Tiingo request/authentication shape, positive-price/calendar checks, empty/missing prices, 401/403/429, bounded retries, rate cooldowns, provider selection/cache separation, absent keys and diagnostic redaction. Browser checks use explicit controlled fixtures; they do not establish actual provider access.

This cloud's Yahoo chart and Tiingo documentation requests were denied by the outbound proxy with CONNECT 403; the modern yfinance request also failed. There is no injected TIINGO_API_KEY. **Neither provider has been successfully fetched in this environment.** The safe diagnostics can identify your Windows cause after local execution; Windows logs are not accessible from this cloud task. `api.tiingo.com` was added to the existing Yahoo host draft for environment-settings review/save and publication; a saved draft does not apply or verify access. Local Windows uses its own network and account permissions. No proxy bypass, scraping around a restriction, TLS disablement or fabricated real prices is implemented.

To exercise the explicit fallback scenario without external credentials, stop existing servers and run `.venv/bin/python backend/scripts/run_market_fixture_server.py --configured-fallback-fixture`, start Vite, then run `EXPECT_CONFIGURED_FALLBACK=1 CHROMIUM_PATH=/usr/bin/chromium npm run test:real-market` from frontend on Linux. PowerShell: use the Windows venv Python and set `$env:EXPECT_CONFIGURED_FALLBACK="1"` before `npm run test:real-market` (install Playwright Chromium first). The harness explicitly labels its controlled Tiingo fixture and uses only temporary research artifacts. Production startup never enables it.
