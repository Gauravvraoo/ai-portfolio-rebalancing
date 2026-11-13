# Historical Market Analysis

Market Analysis now contains historical research data only. The real-time ETF
watch, external streaming authentication, internal stream endpoint and market
WebSocket proxy have been removed. No live provider replaces them. Streaming
keys, feed choices and streaming-origin settings are no longer read or required.
Remove any obsolete streaming credentials from your own terminal, environment
settings or deployment secret store if you configured them previously. Do not
share credential values in chat or commit them.

The existing Synthetic Demo and real historical provider paths remain intact:

- Market Analysis alone displays the shared source/range/cash-yield header.
- Its historical information panel shows the actual provider, date window,
  observation count, last trading date and tracked ETFs.
- Existing asset cards, cumulative performance chart, correlation heatmap and
  return/volatility comparison use the same historical API and calculations.
- Yahoo Finance via yfinance remains available for adjusted historical prices;
  the existing opt-in Tiingo historical provider is unchanged.
- CASH is an assumed-yield account, never a market-traded quote. Synthetic data,
  historical-not-live disclosures and illustrative ESG labels remain visible.
- Training and Strategy Comparison retain their form-specific source/range and
  cash-yield configuration. Saved experiments, immutable snapshots, replay
  results and exports are not migrated or rewritten.

The topbar's **API connected** indicator comes from `/api/health`, which tests
FastAPI/SQLite connectivity. It does not indicate provider connectivity, live
prices or successful external historical downloads.

## Startup

Use the unchanged Windows `START_PROJECT.bat` after the README's dependency
installation. No streaming API key or account configuration is needed. Historical
providers still require their existing network access and, for optional Tiingo,
its existing key. Synthetic Demo remains available offline after installation.

Uvicorn's standard dependency bundle can retain a WebSocket transport library;
that server dependency does not create a market-data integration. The removed
streaming-specific pin is no longer declared. Vite's own development hot reload
can use a WebSocket; the app does not open market-data WebSockets.

## Validation

From the repository root:

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m unittest discover -s scripts -p test_windows_launcher.py
npm test --prefix frontend
npm run build --prefix frontend
```

For provider-independent browser checks, start the explicit historical fixture
harness and Vite in separate terminals:

```sh
.venv/bin/python backend/scripts/run_market_fixture_server.py
npm run dev --prefix frontend -- --port 5173 --strictPort
```

Then run:

```sh
CHROMIUM_PATH=/usr/bin/chromium node frontend/scripts/dashboard-overview-smoke.cjs
CHROMIUM_PATH=/usr/bin/chromium npm run test:real-market --prefix frontend
```

On Windows use `.\.venv\Scripts\python.exe`, run `npx playwright install chromium`
from `frontend` once, and omit the CHROMIUM_PATH prefix. These checks use labeled
historical provider fixtures, not external downloads, and exercise real PPO
training/evaluation and six-strategy replay. The route regression also asserts
that no market-data WebSocket is opened. Portable launcher tests do not certify
Windows-specific console behavior; `START_PROJECT.bat` and its implementation
are unchanged.

Removal validation: 90 backend tests, 12 frontend unit tests, seven portable
launcher checks and the production build passed. The six-route regression
passed 16 accessibility audits and confirmed zero market-data WebSocket
connections. The historical research browser suite passed actual PPO
evaluation, six-strategy snapshot replay, exports and 10 additional audits using
its explicitly labeled provider fixture. No external historical download or
Windows-native execution is claimed by those fixture/portable tests.
