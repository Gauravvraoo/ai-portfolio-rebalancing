# Free public deployment — Verdant Portfolio Intelligence

Deploy **feat/public-deployment**, based on **feat/remove-alpaca-streaming**.
No site has been deployed or public URL verified by preparing this branch.
The configuration provisions no paid resources. Confirm the providers' current
free-plan eligibility and terms before creating services.

## Render: FastAPI Web Service

1. Connect this GitHub repository to Render. Create a **Web Service**, choose
   branch `feat/public-deployment`, Python runtime, and **Free** instance type.
   Alternatively import the root `render.yaml` Blueprint; inspect its Free plan
   before creating it. Do not add a paid disk, database, or worker.
2. Use these exact settings:

   | Setting | Value |
   | --- | --- |
   | Root directory | `backend` |
   | Build command | `pip install -r requirements-render.txt` |
   | Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
   | Health check path | `/api/health` |
   | Python | `PYTHON_VERSION=3.12.8` |
   | Public demo | `PUBLIC_DEMO_MODE=1` |
   | Frontend origin | `CORS_ORIGINS=https://YOUR-PROJECT.vercel.app` |
   | CPU threads | `OMP_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1` |

   The requirements file uses an official CPU-only PyTorch 2.6.0 wheel for
   Python 3.12/Linux x86_64 and includes every existing backend dependency.
   It does not install CUDA packages. No Alpaca credentials are used.
3. Render supplies `PORT`; do not hardcode it. Keep **one API worker**, because
   process ownership, concurrency guards, and artifact recovery are process-local.
4. Copy the actual HTTPS service origin after deployment, for example
   `https://verdant-api.onrender.com`. This is an example, not a verified URL.
5. Visit `https://YOUR-API.onrender.com/api/health`. Expect `status: "ok"`,
   `database: "connected"`, and `public_demo: true`.

If the Vercel hostname is not yet known, deploy Vercel to obtain it, then set
the exact origin on Render and redeploy Render. CORS origins have no path or
trailing slash. Multiple explicitly approved origins may be comma-separated;
do not use `*` or blanket `*.vercel.app`. Preview deployment origins must be
added individually if they need API access. CORS is a browser restriction,
not authentication.

## Vercel: React/Vite

1. Import the same repository. Use branch `feat/public-deployment`; set it as
   the production branch if this is a new project. Do not merge into main.
2. Select the free **Hobby** plan only if your use qualifies under its terms.
3. Configure:

   | Setting | Value |
   | --- | --- |
   | Framework | Vite |
   | Root directory | `frontend` |
   | Install command | `npm ci` |
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Node.js | 24.x |
   | Environment variable | `VITE_API_BASE_URL=https://YOUR-API.onrender.com` |

4. Set the variable for Production (and Preview only if needed). Use the backend
   **origin only**, without `/api`. Vite embeds this public value at build time;
   redeploy the frontend after changing it. Never put keys or tokens in
   `VITE_*` variables.
5. Deploy and copy the actual frontend HTTPS origin into Render's
   `CORS_ORIGINS`; redeploy Render. `frontend/vercel.json` configures the build
   output and SPA history fallback so direct links such as `/training` work.

The shared URL helper covers JSON calls, baseline CSV downloads, and advanced
backtest exports. With no `VITE_API_BASE_URL`, requests remain relative `/api`
and use the original local Vite proxy. Builds reject explicitly configured
HTTP/localhost origins and URLs containing paths or credentials. An unset
value is allowed for the existing local production-preview workflow; it must
be set for Vercel because Vercel does not host this FastAPI application.

## Free-tier training and persistence contract

**The recommended public service is a sample demo, not an online PPO trainer.**

- Real local PPO optimization, validation checkpoint selection, held-out
  evaluation, risk/ESG constraints, reward calculations, historical-data
  calculations, and six-strategy replay code remain intact.
- Render Free web services typically have **512 MiB RAM** and shared limited
  CPU. Check [Render's current free-service limits](https://render.com/docs/free).
  In this workspace a Quick-mode PPO worker peaked at **397,048 KiB RSS**;
  the demo API alone was observed at **138,272 KiB RSS**. These separate
  measurements are not a Render benchmark or an exact simultaneous peak, but
  their approximate sum exceeds 512 MiB before other overhead. Training on
  Render Free has **not** been tested and cannot be promised reliable.
- `PUBLIC_DEMO_MODE=1` serves committed precomputed **synthetic** experiments
  and backtests from `backend/demo`. They were computed with genuine local CPU
  PPO (seed 7, 512 steps per agent), explicit test evaluation, and all six
  strategy replays. They are educational samples, not live training or verified
  real-market performance. The sidebar labels this mode. The training/evaluate
  and new-backtest POST endpoints return an explanatory 403; existing pages,
  sample charts, sample exports, allocation simulation and baseline reports
  remain available. Buttons are retained and surface the API explanation.
- The samples are source-controlled and restored from the deployment checkout.
  New user-generated models, experiments, SQLite changes, and market caches
  **do not persist reliably** on Render Free. Source-controlled samples are
  not durable user storage.
- SQLite defaults to `backend/data/portfolio.db`; normal startup seeds missing
  baseline rows from the unchanged CSV. Local experiments/checkpoints live in
  `backend/experiments` and backtests in `backend/backtests`. Background jobs
  use subprocesses, write JSON/NPZ/checkpoints/logs, and are terminated during
  graceful API shutdown. Incomplete local jobs become failed on restart, not
  resumed. Free-service redeploys/restarts may lose their files entirely.
- Optional existing backend path overrides: `PORTFOLIO_DB_PATH`,
  `PORTFOLIO_EXPERIMENT_DIR`, `PORTFOLIO_BACKTEST_DIR`,
  `PORTFOLIO_MARKET_CACHE_DIR`. Put them only on the backend; paths on Render's
  ephemeral disk do not provide persistence. Demo mode intentionally reads
  bundled samples instead of experiment/backtest path overrides.
- Free services sleep after inactivity (currently 15 minutes); wake-up can take
  longer than the frontend's existing 15-second request timeout. Wake the health
  endpoint, wait, and retry. Do not use artificial keep-alive traffic. Free
  quotas, bandwidth, build limits and availability may change; no uptime guarantee.
- Synthetic mode works without external credentials. Yahoo historical requests
  still depend on provider access, terms and rate limits; a successful synthetic
  demo does not verify Yahoo access. Optional Tiingo still requires appropriate
  credentials/access; keep those backend-only. There is no Alpaca dependency.
- The public demo has shared samples and no user accounts or private storage.
  Keep online training disabled. Durable multi-user research and background
  training require a separate architecture; they are not a free-tier promise.

To regenerate samples deliberately on a suitably sized local machine:
archive `backend/demo` outside the checkout, then from `backend` run
`../.venv/bin/python scripts/build_public_demo.py`. The script refuses to
overwrite existing samples and computes in temporary storage. It is never
invoked at application startup or on Render. Inspect and commit its outputs
only after validation. Local price fixtures and existing research files are
not modified.

## Test the deployment

Replace the example origins below with the actual URLs:

1. Request the backend health endpoint and confirm `public_demo: true`.
2. Open the Vercel site and inspect all six navigation destinations. Refresh
   `/market`, `/training`, `/comparison`, and `/reports` directly to check SPA routing.
3. Check the Dashboard's original metrics/overview and dark layout. In browser
   Network tools, all API calls and exports must target the configured HTTPS
   backend; none may target localhost or the Vercel SPA fallback.
4. Confirm allowed-origin preflight:
   `curl -i -X OPTIONS https://YOUR-API.onrender.com/api/simulate -H "Origin: https://YOUR-PROJECT.vercel.app" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`.
   Expect the exact `Access-Control-Allow-Origin`. An unapproved origin must
   not receive that header.
5. Open the sample completed experiment and saved comparison, inspect all six
   strategies, export JSON and summary/history CSV, and download the baseline
   report. Confirm the public-sample label; never describe these as new training.
6. Try starting a training/evaluation/backtest: expect a clear public-demo
   explanation and no worker creation. Allocation simulation remains functional.
7. After a sleep/restart, wait for health, retry the frontend, and verify bundled
   sample availability. Do not use this as evidence that user files persist.

Local regression commands, from the repository root after normal installation:

```bash
.venv/bin/python -m pytest -q
python -m unittest discover -s scripts -p test_windows_launcher.py
npm test --prefix frontend
npm run build --prefix frontend
# With the original local backend :8000 and Vite :5173 running:
CHROMIUM_PATH=/usr/bin/chromium npm run test:smoke --prefix frontend
CHROMIUM_PATH=/usr/bin/chromium npm run test:training --prefix frontend
CHROMIUM_PATH=/usr/bin/chromium npm run test:backtesting --prefix frontend
```

On Windows use `.venv\Scripts\python.exe` and your installed Playwright Chromium
rather than the Linux Chromium path. `START_PROJECT.bat` and its launcher
implementation are unchanged; Linux launcher unit tests cannot certify actual
Windows double-click/console behavior.

## Rollback and keep localhost intact

Do not copy production environment variables into your local shell or `.env`.
Keep `PUBLIC_DEMO_MODE`, `CORS_ORIGINS`, and `VITE_API_BASE_URL` unset locally
to retain the existing defaults. Start locally with `START_PROJECT.bat` or the
unchanged README commands. `API_PROXY_TARGET` still defaults to port 8000.

Rollback hosted releases using Render/Vercel's previous deployment controls,
or stop/delete the new free services. Neither affects local files.
To return to the original code, save any work then switch to
`feat/remove-alpaca-streaming`; do not reset/delete local databases, experiments,
backtests or models. Nothing is merged into main.

## Validation evidence

Executed in the Linux cloud workspace:
- Backend: 92 pytest tests passed (11 existing numerical/Gymnasium warnings).
- Frontend: 14 Node tests passed; HTTPS-configured production build passed.
- Portable Windows launcher unit tests: 7 passed; no actual Windows execution.
- Existing browser smoke, real PPO training/evaluation, and backtesting suites passed.
- GUI suite: 18 page/viewport checks and 12 WCAG A/AA audits passed; screenshots
  were saved outside the repository.
- Production bundle: all six routes, configured HTTPS request destination,
  demo label and baseline CSV download passed with a local interception harness.
- Explicit HTTP/localhost production API configuration was rejected as intended.
- Render CPU dependency installation and `pip check` passed.
- Source comparison confirms unchanged Dashboard component/styles, Windows
  launcher, historical calculations, PPO, reward/constraint and backtest engines.

These checks verify development behavior in this workspace, not every possible
local/platform interaction or the resources of a live Render Free service. A local production-build
browser check can intercept the configured HTTPS example origin and forward it
to a local backend; that checks URL usage and rendering, **not** public DNS,
TLS, provider access, or successful Render/Vercel deployment. Verify the real
public URLs after following these manual steps.
