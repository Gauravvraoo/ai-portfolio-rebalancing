# Market Analysis dashboard

The dashboard uses the existing `/api/market` response. No provider, price,
correlation, volatility, ESG, PPO, replay, export or launcher calculations change.
This feature branch starts from `fix/historical-provider-reliability` because
`main` still contains only the initial README.

Market Analysis now fills the available workspace width, with responsive asset
cards and a 420px desktop / 340px mobile historical performance chart. The
symbol controls double as an interactive legend. The chart has dated tooltips,
month/year ticks and percent values. The comparison chart shows full-period
return alongside annualized volatility; its disclosure explains that these use
different horizons. The heatmap displays the API's Pearson coefficients and
keeps undefined constant-cash correlations as N/A.

Cards show the last available observation date, adjusted ETF closes (two decimal
places), cumulative returns and the cash account per initial $1 (up to four
decimal places). CASH yield is explicitly assumed. Historical data is never
labeled live, synthetic data stays labeled, and ESG scores stay illustrative.
The shared data-notice component now accepts an optional badge; other pages keep
the existing synthetic default. No new market data or ratings are supplied.

## Validation

Install using the README, then run from the repository root:

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m unittest discover -s scripts -p test_windows_launcher.py
npm test --prefix frontend
npm run build --prefix frontend
```

For browser validation, start a **fresh isolated fixture backend**:

```sh
.venv/bin/python backend/scripts/run_market_fixture_server.py
# Separate terminal
npm run dev --prefix frontend -- --port 5173 --strictPort
```

Run these suites in order against the same isolated backend:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:training --prefix frontend
CHROMIUM_PATH=/usr/bin/chromium npm run test:backtesting --prefix frontend
SCREENSHOT_DIR=/tmp/verdant-gui CHROMIUM_PATH=/usr/bin/chromium npm run test:gui --prefix frontend
CHROMIUM_PATH=/usr/bin/chromium npm run test:real-market --prefix frontend
```

The older synthetic suites require a completed/evaluated synthetic PPO pair and
synthetic backtest artifacts. Run historical tests last: the older runners assume
all saved jobs belong to Synthetic Demo, whereas the app correctly filters
incompatible historical models. Their initial runs against historical-only
artifacts failed those runner assumptions; application code was not changed to
work around them.

The historical suite includes dashboard checks for five asset cards, values
matching the backend response, 380–450px desktop chart height, all 25 correlation
cells, undefined cash correlation, visible cash-yield disclosure, and the 5Y
quick control. It also exercises source/range/refresh/failure/retry, actual PPO
optimization/evaluation, six-strategy replay, exports, mobile overflow and
accessibility. Additional browser inspection checked the historical badge and
observation-date tooltip and captured desktop/mobile screenshots.

The provider fixture is explicitly labeled and does **not** demonstrate an
external Yahoo or Tiingo download. Production still uses the existing configured
provider endpoints; no fixture is enabled by the application or Windows launcher.
Portable launcher checks do not certify Windows console behavior.

Results on this branch: 89 backend tests passed (11 dependency/numerical
warnings), 7 portable launcher checks passed, 12 frontend unit tests passed,
and the production build passed. The ordered training, backtesting, GUI and
historical browser suites passed. GUI coverage included 18 route/viewport
checks and 12 accessibility audits; the historical suite included 10 audits.
