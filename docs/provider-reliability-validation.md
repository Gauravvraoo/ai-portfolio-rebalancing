# Historical provider reliability fix

Base: `feat/real-historical-market-data` (`a6c24d0a4e49d82fc77b802cad2f15df926e2534`). Fix branch: `fix/historical-provider-reliability`.

## Diagnosis and fixes

The old API turned every provider exception into the same generic message. Windows logs are not accessible from this cloud task, so the reported Windows root cause cannot be confirmed remotely. This environment does provide concrete failure evidence: a Yahoo chart request and a Tiingo documentation-host request both failed with proxy CONNECT 403. No external market price was successfully retrieved.

Inspection of yfinance 0.2.65 found that `history(raise_errors=True)` did not reliably expose failures in the earlier timezone/bootstrap lookup. Upgraded to the verified PyPI 1.8.0 release and its supported `yf.config.debug.hide_exceptions=False` setting, restored after each adapter call. SDK raw debug/error output is suppressed and replaced with whitelisted application diagnostics. The final actual modern-adapter request reported Yahoo / SPY / `proxy_denied` / HTTP 403 / one attempt (request ID `5652479a-853c-4df3-80d1-af505994c9ab`). This verifies the failure path, not successful data access.

Added distinct transport/access/rate-limit/TLS/configuration/parse/calendar/cache error codes, request IDs, symbols, phases, attempt counts and safe runtime presence/version metadata. `GET /api/market/diagnostics` makes no outbound request. Structured backend events and HTTP error JSON omit credentials, proxy addresses, headers, response bodies and raw exception text. Tests specifically cover redaction and curl's zero-status CONNECT-403 edge case.

Only transient connection/timeout/server failures get one 0.5-second bounded retry, unless a positive Retry-After hint forbids immediate retry. No immediate retry on 401/403/429, TLS errors or invalid prices. Rate cooldowns apply across ranges for at least 300 seconds and honor longer provider Retry-After hints. Other negative caches last at least 60 seconds; positive cache TTL remains six hours, with refresh coalescing for 60 seconds. Corrupt or expired data is not silently substituted. Provider-policy namespaces prevent reuse of Yahoo caches when Tiingo is selected.

Tiingo End-of-Day is an explicit alternative: `MARKET_DATA_PROVIDER=tiingo`, or an opt-in `MARKET_DATA_FALLBACK_PROVIDER=tiingo` with Yahoo primary. It requires a securely supplied TIINGO_API_KEY and suitable ETF/history/account permissions. Uses official HTTPS daily-price endpoints, Authorization header authentication, no credential-bearing URLs and no redirects. Consumes adjClose only. All four ETFs are fetched from one provider, observed calendars are intersected with no filling, and CASH remains a separate $1 account snapshot with yield applied by the existing engine. Fallback identity/reason is visible and saved. Existing model comparisons remain tied to their original immutable snapshots; CSV/JSON and model selectors retain provider identity. No restriction bypass, scraped mirror or fabricated real data was added.

## Executed checks

- **89 backend pytest tests passed**, including all previous 64 plus 25 reliability cases (parameterized cases included): Yahoo bootstrap propagation and price contract, HTTP/proxy/TLS classification, Tiingo authenticated adjusted-price success, missing/empty/unadjusted/insufficient data, provider access/rate failures, absent keys, default-no-fallback and explicit fallback, cache isolation, redaction, bounded retries and Retry-After handling.
- **12 frontend unit tests passed**, including provider diagnostic message/status preservation.
- **7 portable Windows-launcher tests passed**; both launcher files have zero changes relative to the base branch.
- Frontend production build, pip dependency consistency and Git whitespace checks passed.
- Browser fallback workflow passed with an explicitly labeled controlled Tiingo fixture: source/range/refresh/error recovery, fallback badge, genuine PPO optimization/evaluation, six-strategy snapshot replay, mismatch rejection, report exports, mobile layouts and **10 axe audits with zero violations**. No browser exceptions.
- Original browser smoke, training, backtesting, GUI and integration suites passed. Includes synthetic workflows, actual PPO workers, baseline/research separation, four/six strategies, all exports, reload persistence, mobile keyboard behavior, proxy verification, background refresh, **18 viewport checks and 12 axe audits with zero violations**. Screenshots stayed outside tracked documentation.

## Boundaries

The browser harness explicitly labels controlled prices as not a provider download; it replaces only the provider fetch/metadata in an isolated temporary test process. Actual training, accounting, evaluation, API handling and exports run normally. Normal startup never imports the harness. The fixture server is stopped after validation and the normal backend restored.

Yahoo remains blocked by Cloud proxy policy. Tiingo has no injected API key and its host is blocked here; authenticated Tiingo retrieval was not verified. `api.tiingo.com` was added to the existing Yahoo host draft, preserving existing entries; review/save and publish in environment settings are still needed to apply access. This does not establish provider entitlement or affect the user's Windows network. Do not claim live data validation from mocked contracts or the browser fixtures.

Windows-specific execution, default-browser/process behavior and the user's actual provider/account/network response require local verification. README contains secure PowerShell key setup, launch commands and the safe diagnostic endpoint. Legacy datasets/models/experiments and START_PROJECT.bat remain unchanged. Nothing is merged into main.
