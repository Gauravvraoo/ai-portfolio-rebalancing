# Alpaca ETF trade streaming — Market Analysis only

This branch starts from `fix/dashboard-original-overview` (`917830e`). The
Dashboard JSX, app layout, shared components and global styles are unchanged.
Market Analysis adds a separate stream of **actual exchange trade events** for
SPY, AGG, GLD and QQQ. The existing historical provider, panels, prices,
correlations, calculations and research artifacts remain separate. No CASH
quote or brokerage/order-execution endpoint is implemented.

## Exact Windows checkout and startup

Stop existing services normally (Q/Ctrl+C in the existing launcher). In
PowerShell, from your existing repository checkout:

```powershell
git fetch origin
git switch --track origin/feat/alpaca-etf-stream
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci --prefix frontend

# Explicit feed: iex for IEX-only real-time; sip requires your SIP subscription.
$env:ALPACA_DATA_FEED = "iex"
# Select the account whose key you supply; this selects ONLY the read-only clock host.
$env:ALPACA_ACCOUNT_ENV = "paper"  # or "live" for a live-account key

$alpacaKey = Read-Host "Alpaca API key" -AsSecureString
$env:ALPACA_API_KEY = [System.Net.NetworkCredential]::new("", $alpacaKey).Password
$alpacaSecret = Read-Host "Alpaca API secret" -AsSecureString
$env:ALPACA_API_SECRET = [System.Net.NetworkCredential]::new("", $alpacaSecret).Password
Remove-Variable alpacaKey, alpacaSecret

.\START_PROJECT.bat

# After quitting the launcher, clear this terminal's credentials:
Remove-Item Env:ALPACA_API_KEY, Env:ALPACA_API_SECRET -ErrorAction SilentlyContinue
```

Use your own appropriate Alpaca data subscription and exchange entitlements.
Launch from **this same PowerShell session**; Explorer double-click doesn't
inherit its temporary environment variables. Never put keys in Git, frontend
VITE variables, chat, URLs or literal shell history. The launcher is unchanged;
it inherits the backend variables, and Vite now proxies the internal WebSocket.
Open Market Analysis. Dashboard never mounts this feature or opens its socket.

If already on the branch, use `git switch feat/alpaca-etf-stream` rather than
creating a second tracking branch. For a fresh machine, first follow the README's
Python 3.11–3.12 venv / CPU PyTorch and Node 22+ prerequisite installation.

## Protocol and runtime

The backend uses the documented JSON stock WebSocket protocol:
`wss://stream.data.alpaca.markets/v2/iex` or `/v2/sip`. It waits for `connected`,
sends the `auth` message, waits for `authenticated`, subscribes to the four
`trades`, then requires the matching subscription acknowledgement. Only then is
the requested feed marked confirmed. IEX is **IEX-only**, not consolidated US
market coverage. SIP is labeled confirmed only after authorization/subscription.
There is no SIP-to-IEX, delayed-feed, Yahoo or synthetic fallback.

Official references:

- https://docs.alpaca.markets/docs/streaming-market-data
- https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data
- https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/live/websocket.py
- https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/live/stock.py
- https://docs.alpaca.markets/reference/getclock-1

`/api/market/stream` is an internal, read-only WebSocket. **Run one API worker**, as
already required for existing research jobs. One upstream is shared across local
viewers. The last viewer leaving cancels the upstream and clock task. Per-viewer
queues retain only the newest snapshot; slow browsers cannot accumulate an
unbounded tick backlog. Quotes retain their actual provider exchange timestamps
and backend receive timestamps during reconnects. Invalid, future, out-of-order
or duplicate-timestamp trades are dropped. Trade correction/cancel messages
invalidate the symbol's retained observation rather than keeping a potentially
invalid trade. No credential or raw provider-error message is broadcast/logged.

Authentication, subscription and permission failures stop instead of retrying
indefinitely. Transient failures use exponential backoff capped at approximately
60 seconds with jitter; rate/connection limits wait at least 60 seconds and HTTP
Retry-After is honored. Upstream ping/pong and handshake timeouts detect broken
connections. Quiet but responsive markets remain connected and display “No
recent trades”; the UI never manufactures ticks using a timer. Its one-second
clock only ages labels and shows New York time. Hidden tabs close their internal
socket and resume when visible; navigation cancels retries, socket and timer.

Market session status is obtained from the authenticated read-only Alpaca
`/v2/clock`, at most once per minute while viewers exist, with retry-after honored.
`ALPACA_ACCOUNT_ENV=paper` uses `https://paper-api.alpaca.markets`; `live` uses
`https://api.alpaca.markets`. No order endpoint is called. If this account clock
is unauthorized, unavailable or stale, session status is **unavailable**, never
inferred from weekdays (holidays and early closes matter). “Market Closed” refers
to the regular session; extended-hours trade events may still arrive.

**Daily changes are explicitly unavailable**: this implementation does not have
a validated, comparable same-feed previous-close reference. It never substitutes
Yahoo adjusted history, yesterday's last observed tick, or a zero percentage.
Displayed prices are last received trades, not NBBO quotes or execution prices.
A trade older than 60 seconds, or any retained trade after disconnect, is labeled
stale/no recent trades; its exchange/receive timestamps are never restamped.

## Access, licensing and connectivity

Keep this application bound to loopback for personal authorized research use.
Internal browser WebSockets accept local dev origins by default and reject other
origins. No provider secrets enter the frontend. For any deployment, an operator
must provide authentication at the reverse proxy, configure
`ALPACA_STREAM_ALLOWED_ORIGINS` to exact permitted browser origins, forward the
WebSocket Upgrade, and ensure every viewer/use/redistribution is permitted by
Alpaca and the applicable exchange subscription agreements. An origin allowlist
is not a substitute for user authentication or redistribution permission. Do not
expose this local research endpoint publicly without those controls.

Outbound destinations required are `stream.data.alpaca.markets` (WSS/443) and the
selected account clock host (HTTPS/443). TLS verification and inherited proxy
settings stay enabled. Some managed proxies do not support authenticated WSS;
use a supported runtime route, never disable verification or bypass policy.
WebSocket authentication credentials must be real backend environment bindings;
HTTP-only proxy placeholder substitution cannot rewrite a JSON auth frame.

**No real Alpaca/exchange connection has been verified in this cloud task.**
`ALPACA_API_KEY` and `ALPACA_API_SECRET` were absent. The official documentation
host was denied by the outbound proxy; the official SDK source was accessible
and inspected for protocol behavior. Tests use explicit mocks only. Windows
execution and your subscription/entitlements require validation on your machine.

## Tests

```sh
.venv/bin/python -m pytest -q
.venv/bin/python -m unittest discover -s scripts -p test_windows_launcher.py
npm test --prefix frontend
npm run build --prefix frontend
```

For browser checks start `backend/scripts/run_market_fixture_server.py` with the
venv Python, then Vite on port 5173, then:

```sh
CHROMIUM_PATH=/usr/bin/chromium node frontend/scripts/alpaca-stream-smoke.cjs
CHROMIUM_PATH=/usr/bin/chromium node frontend/scripts/dashboard-overview-smoke.cjs
```

On Windows, install Playwright Chromium using `npx playwright install chromium`
in `frontend`, omit CHROMIUM_PATH, and use `.\.venv\Scripts\python.exe`. The
Alpaca browser check verifies the actual internal FastAPI WebSocket/proxy with
missing credentials, then uses **MOCKED TEST EVENTS** for connecting, IEX trade,
staleness, SIP denial, reconnecting and market-closed UI states. Mock screenshots
are labeled and do not establish a live feed. Backend tests exercise protocol
auth/subscription, validated trades, shared connection, failed auth/SIP,
heartbeat, reconnection, close cleanup and stale clock. Existing backend PPO,
backtesting, historical-provider and launcher regressions remain enabled.

Validated in this task: 101 backend tests passed, 16 frontend unit tests passed,
7 portable launcher checks passed, and the production build passed. The stream
browser suite passed its actual internal missing-credential WebSocket check,
mocked event/status cases, lifecycle cleanup and three responsive accessibility
audits. The Dashboard regression browser suite passed six accessibility audits
and confirmed its heading/buttons/six KPIs/charts in both historical selections.
Git diff confirms Dashboard, app layout, global styles, shared components,
other page implementations, historical calculations, PPO/backtesting code and
Windows launcher are unchanged from `917830e`.
