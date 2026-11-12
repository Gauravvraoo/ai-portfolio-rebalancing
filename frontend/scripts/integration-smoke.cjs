const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const exceptions = [];
    page.on('pageerror', e => exceptions.push(e.message));
    // Verify the built SPA and its preview proxy, not just Vite development.
    await page.goto('http://127.0.0.1:4173');
    await page.getByText('Your holdings', { exact: true }).waitFor();
    assert.equal((await (await page.request.get('http://127.0.0.1:4173/api/health')).json()).database, 'connected');
    await page.goto('http://127.0.0.1:5173/training');
    await page.route('**/api/training/jobs', r => r.fulfill({ status: 503, body: 'Unavailable' }));
    await page.reload();
    await page.getByRole('alert').waitFor();
    assert(await page.getByRole('button', { name: 'Train both PPO agents', exact: true }).isDisabled());
    await page.unroute('**/api/training/jobs');
    await page.getByRole('button', { name: 'Retry status' }).click();
    await page.getByRole('button', { name: 'Train both PPO agents', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
    const runs = await (await page.request.get('http://127.0.0.1:5173/api/backtests')).json();
    assert(runs.length >= 2, 'Run backtesting smoke first to create actual results');
    await page.goto(`http://127.0.0.1:5173/comparison?run=${runs[0].id}`);
    await page.getByText(runs[0].id, { exact: true }).waitFor();
    // Change only the search parameter while keeping the comparison mounted.
    await page.evaluate(id => {
      history.pushState({}, '', `/comparison?run=${id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, runs[1].id);
    await page.getByText(runs[1].id, { exact: true }).waitFor();
    // An active run must finish in the list even while an older result is selected.
    const created = await page.request.post('http://127.0.0.1:5173/api/backtests', { data: {} });
    assert.equal(created.status(), 202);
    await page.reload();
    await page.getByText(runs[1].id, { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Run backtest');
      return button && !button.disabled;
    }, null, { timeout: 60000 });
    assert.deepEqual(exceptions, []);
    console.log('PASS: production preview/proxy, training outage/recovery, same-page saved-run navigation, background list refresh; no browser exceptions');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
