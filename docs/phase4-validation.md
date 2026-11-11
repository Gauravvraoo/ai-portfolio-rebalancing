# Phase 4: premium GUI redesign

This branch is based on Phase 3 commit `25e5b95`, retaining the complete Phase 1/2/3 history. Changes are confined to the frontend, its development tests, documentation and screenshots. No backend calculation, API, database fixture or saved model format was changed.

## Implementation

Rebuilt the application frame and split the original monolithic page implementation into separate Dashboard, Market, Rebalance, Reports and baseline-comparison modules. Added shared page headers, KPI cards, workflow guides, status/empty/error/loading components and a consistent navy/charcoal design system. Training and backtesting retain their API workflows and adopt the shared visual language.

The dashboard's monthly Sharpe is explicitly calculated from returned baseline observations with a zero risk-free rate. Activity reads actual daily backtest trade records and identifies its source separately from the monthly portfolio. Market filters, allocation presets/sliders, JSON simulation export, source-linked comparisons and a selectable report library are functional.

Desktop navigation is fixed; tablet/mobile navigation has a focus trap, Escape handling, focus restoration and an inert background. Scrolling tables are keyboard-focusable, chart regions are labeled, progress meters have accessible names, and reduced motion is respected.

## Verification

- Backend: **52 tests passed**, including original API, accounting, constraint, actual PPO training/evaluation and six-strategy backtesting tests.
- Frontend unit checks: **3 passed**, covering independent monthly Sharpe arithmetic, undefined values and filtering actual rebalance records.
- Production Vite build verified.
- Existing six-route browser suite passed: navigation, simulation, invalid weights, baseline CSV, mobile navigation and API failure/retry.
- Training browser suite passed with genuine independent Quick-mode PPO jobs, status, learning curves, held-out evaluation and persistence.
- Backtesting browser suite passed with real four/six-strategy runs, charts, filters/zoom, allocations, three exports, mobile layout and errors.
- Additional GUI suite: **18 page/viewport checks passed**, with all six pages at 1440px, 820px and 390px. **12 axe WCAG A/AA audits reported zero violations** across desktop/mobile pages. Dashboard filter/data-source checks, report exports, allocation controls, mobile keyboard behavior and honest empty-state tests passed with no browser exceptions.
- `npm audit`: zero vulnerabilities.
- Final screenshots: [desktop dashboard](screenshots/phase4/dashboard-desktop.png), [desktop comparison](screenshots/phase4/comparison-desktop.png), [mobile dashboard](screenshots/phase4/dashboard-mobile.png), [mobile comparison](screenshots/phase4/comparison-mobile.png).

## Evidence boundaries

Prices/ESG remain synthetic/illustrative. Monthly baseline results and daily backtest activity are distinct labeled sources. Screenshots contain actual computed verification records; generated models/results remain in ignored backend artifact directories. Browser verification uses Chromium on Linux. Windows execution, Safari/Firefox and formal screen-reader certification are not claimed. Standard-mode convergence and real-market investment performance remain outside this GUI phase.
