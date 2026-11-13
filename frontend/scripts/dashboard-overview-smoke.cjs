// Start Vite and the explicit run_market_fixture_server.py harness before running.
// Provider fixtures validate rendering; they do not establish external provider access.
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let kpis;
    for (const source of ['synthetic', 'real']) {
      await page.goto('http://127.0.0.1:5173/market');
      await page.getByLabel('Data source', { exact: true }).selectOption(source);
      await page.getByRole('heading', { name: source === 'real' ? 'Historical Market Data' : 'Synthetic Demo Dataset', exact: true }).waitFor();
      assert.equal(await page.locator('.market-asset-grid .asset-card-value').count(), 5);
      assert.equal((await page.locator('.market-history-chart').boundingBox()).height, 420);
      await page.getByRole('heading', { name: source === 'real' ? 'Daily return correlations' : 'Monthly return correlations' }).waitFor();
      const marketRequests = [];
      const onRequest = request => { if (request.url().includes('/api/market?')) marketRequests.push(request.url()); };
      page.on('request', onRequest);
      await page.goto('http://127.0.0.1:5173/');
      await page.locator('.dashboard-kpis .metric').first().waitFor();
      await page.getByRole('heading', { name: 'Your holdings', exact: true }).waitFor();
      page.off('request', onRequest);
      assert.equal(marketRequests.length, 0, 'Dashboard must not request a historical dataset');
      assert.equal(await page.locator('.source-controls').count(), 0);
      assert.equal(await page.getByRole('heading', { name: /Active historical market dataset|Historical Market Intelligence|Historical Market Data/ }).count(), 0);
      assert.equal(await page.locator('.dashboard-kpis .metric').count(), 6);
      const current = await page.locator('.dashboard-kpis').innerText();
      if (kpis) assert.equal(current, kpis, 'Selected historical source cannot change baseline KPIs');
      kpis = current;
      assert(await page.locator('.page-title').evaluate(el => el === document.querySelector('.page-content').firstElementChild && el.nextElementSibling.matches('.dashboard-kpis')), 'Heading must lead directly into KPIs');
      assert.equal(await page.getByRole('link', { name: 'View reports', exact: true }).count(), 1);
      assert.equal(await page.getByRole('link', { name: 'Rebalance portfolio', exact: true }).count(), 1);
      await page.getByRole('heading', { name: 'Portfolio performance', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Asset allocation', exact: true }).waitFor();
      for (const width of [1440, 820, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
        assert.deepEqual(audit.violations.map(v => v.id), []);
        if (source === 'real' && width !== 820) await page.screenshot({ path: `/tmp/verdant-original-dashboard-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name: '3M', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '3M', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.dashboard-kpis').innerText(), kpis);
    }
    // Only Market Analysis mounts the global header. Research forms keep scoped inputs.
    for (const route of ['/market', '/training', '/rebalance', '/comparison', '/reports']) {
      await page.goto(`http://127.0.0.1:5173${route}`);
      await page.locator('.page-title').waitFor();
      assert.equal(await page.locator('.source-controls').count(), route === '/market' ? 1 : 0);
      if (route === '/training') await page.getByLabel('Training data source', { exact: true }).waitFor();
      if (route === '/comparison') await page.getByLabel('Backtest data source', { exact: true }).waitFor();
      if (!['/market','/comparison'].includes(route)) assert(await page.locator('.page-title').evaluate(el => el === document.querySelector('.page-content').firstElementChild));
      if (['/training','/comparison'].includes(route)) {
        const label = route === '/training' ? 'Training' : 'Backtest';
        assert.equal(await page.getByLabel(`${label} data source`, { exact: true }).inputValue(), 'real');
        await page.getByLabel(`${label} historical range`, { exact: true }).selectOption('1Y');
        assert.equal(await page.getByLabel(`${label} historical range`, { exact: true }).inputValue(), '1Y');
        assert(await page.getByLabel(`${label} data source`, { exact: true }).evaluate(el => Boolean(el.closest('form'))));
      }
      for (const width of [1440,390]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
        assert.deepEqual(audit.violations.map(v => v.id), [], `${route}/${width}: ${JSON.stringify(audit.violations.map(v => v.nodes.map(n => n.failureSummary)))}`);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: Dashboard heading → six unchanged KPIs, original buttons/charts/period control, no historical panel/controls/requests in both sources; Market panel/charts retained; global header scoped to Market; research form selectors retained; 16 responsive accessibility audits');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
