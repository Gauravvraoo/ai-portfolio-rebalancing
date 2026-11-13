// Run with the explicit isolated backend fixture harness, or an accessible Yahoo backend.
// This runner does not intercept successful data requests or fabricate model results.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const AxeBuilder = require('@axe-core/playwright').default;
(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/market');
    const loaded = page.waitForResponse(r => r.url().includes('/api/market?data_source=real') && r.status() === 200);
    await page.getByLabel('Data source', { exact: true }).selectOption('real');
    let market = await (await loaded).json();
    assert.equal(market.data.data_source, 'real');
    if (process.env.EXPECT_CONFIGURED_FALLBACK === '1') {
      assert.equal(market.data.provider_id, 'tiingo');
      assert.equal(market.data.fallback_used, true);
      await page.getByText(/Explicitly configured provider fallback used/).waitFor();
    }
    assert(market.data.fetched_at && market.data.last_trading_date);
    console.log(`Provider used for browser validation: ${market.data.provider}`);
    await page.getByRole('heading', { name: 'Daily return correlations' }).waitFor();
    assert.equal(
      await page.locator(".market-asset-grid .asset-card-value").count(),
      5,
    );
    const chartBox = await page.locator(".market-history-chart").boundingBox();
    assert(
      chartBox.height >= 380 && chartBox.height <= 450,
      "desktop performance chart height",
    );
    await page
      .getByRole("heading", { name: "Historical return & volatility" })
      .waitFor();
    const cells = await page
      .locator(".market-heatmap tbody td")
      .allTextContents();
    assert.equal(cells.length, 25);
    assert(
      cells.includes("N/A"),
      "constant cash is not assigned fabricated correlation",
    );
    // Card values must come from the same backend response, including decimal precision.
    const spyPrice = market.assets.find((a) => a.symbol === "SPY").price;
    assert(
      (await page.locator(".market-asset-grid").innerText()).includes(
        new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(spyPrice),
      ),
    );
    await page.getByText(/assumed annual yield · not a market quote/).waitFor();
    const quickRange = page.waitForResponse(
      (r) =>
        r.url().includes("data_range=5Y") &&
        r.url().includes("/api/market?") &&
        r.status() === 200,
    );
    await page.getByRole("button", { name: "5Y", exact: true }).click();
    await quickRange;
    await page
      .getByRole("heading", { name: "Daily return correlations" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "5Y", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    const ranged = page.waitForResponse(r => r.url().includes('data_range=1Y') && r.url().includes('/api/market?') && r.status() === 200);
    await page.getByLabel('Historical date range').selectOption('1Y');
    market = await (await ranged).json();
    assert.equal(market.data.data_range, '1Y');
    assert(market.history.length >= 150);
    const refresh = page.waitForResponse(r => r.url().includes('/api/market?') && r.url().includes('refresh=true') && r.status() === 200);
    await page.getByRole('button', { name: 'Refresh market data', exact: true }).click();
    await refresh;
    // An unavailable provider must show an error and no substituted asset cards.
    await page.route('**/api/market?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Provider unavailable. No synthetic fallback was used.' }) }));
    await page.getByRole('button', { name: 'Refresh market data', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.asset-card-value').count(), 0);
    await page.unroute('**/api/market?**');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('heading', { name: 'Daily return correlations' }).waitFor();
    await page.getByRole('link', { name: 'AI Agent Training', exact: true }).click();
    const trainButton = page.getByRole('button', { name: 'Train both PPO agents', exact: true });
    const started = page.waitForResponse(r => r.url().endsWith('/api/training/jobs') && r.request().method() === 'POST' && r.status() === 202);
    await trainButton.click();
    const experiment = await (await started).json();
    assert.equal(experiment.config.data_source, 'real');
    assert.equal(experiment.data.data_range, '1Y');
    await page.waitForFunction(() => document.querySelector('.job-status .chip')?.textContent === 'TRAINED', null, { timeout: 180000 });
    await page.getByRole('button', { name: 'Evaluate saved models on test split' }).click();
    await page.getByRole('heading', { name: 'Held-out test evaluation' }).waitFor({ timeout: 60000 });
    await page.getByRole('link', { name: 'Strategy Comparison', exact: true }).click();
    await page.getByLabel('PPO experiment').selectOption(experiment.id);
    const modelOptions = await page.getByLabel('PPO experiment').locator('option').allTextContents();
    assert(modelOptions.slice(1).every(text => text.includes('Real Historical Market Data')));
    const runStarted = page.waitForResponse(r => r.url().endsWith('/api/backtests') && r.request().method() === 'POST' && r.status() === 202);
    await page.getByRole('button', { name: 'Run backtest', exact: true }).click();
    const run = await (await runStarted).json();
    await page.waitForFunction(id => document.querySelector('.job-status .chip')?.textContent === 'COMPLETED' && document.querySelector('.job-status .job-id')?.textContent === id, run.id, { timeout: 180000 });
    const result = await (await page.request.get(`http://127.0.0.1:5173/api/backtests/${run.id}`)).json();
    assert.equal(result.result.data.data_source, 'real');
    assert.equal(result.result.data.sha256, experiment.data.sha256);
    assert.equal(result.result.results.length, 6);
    assert.equal(await page.locator('.backtest-table tbody tr').count(), 6);
    const mismatch = await page.request.post('http://127.0.0.1:5173/api/backtests', { data: { experiment_id: experiment.id, data_source: 'synthetic' } });
    assert.equal(mismatch.status(), 409);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export metrics CSV', exact: true }).click();
    const text = await fs.readFile(await (await download).path(), 'utf8');
    assert(text.includes('REAL HISTORICAL ADJUSTED PRICES') && text.includes('data_source') && text.includes('backtest_configuration'));
    await page.getByLabel('Data source', { exact: true }).selectOption('synthetic');
    assert.equal(await page.getByLabel('PPO experiment').inputValue(), '');
    assert(!(await page.getByLabel('PPO experiment').locator('option').allTextContents()).some(text => text.includes(experiment.id.slice(0,8))));
    await page.getByLabel('Data source', { exact: true }).selectOption('real');
    // Real mode must preserve distinct labeled baseline metrics and saved reports.
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('heading', { name: 'Portfolio overview', exact: true }).waitFor();
    assert.equal(await page.locator('.source-controls').count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Active historical market dataset' }).count(), 0);
    await page.getByText('Baseline simulation', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await page.getByLabel('Backtest to export').selectOption(run.id);
    const exportJson = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download backtest JSON' }).click();
    assert.equal(JSON.parse(await fs.readFile(await (await exportJson).path(), 'utf8')).data.sha256, experiment.data.sha256);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['/market', '/training', '/comparison', '/reports', '/']) {
        await page.goto(`http://127.0.0.1:5173${route}`);
        await page.waitForFunction(() => !document.querySelector('.skeleton-lines'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow: ${route}/${width}`);
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
        assert.deepEqual(audit.violations.map(v => v.id), [], `accessibility: ${route}/${width}`);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: historical source/range/refresh/error recovery, real-source PPO/evaluation and six-strategy snapshot replay, incompatible models rejected/filtered, dashboard separation, provenance exports, mobile layout and 10 axe audits; no browser exceptions');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
