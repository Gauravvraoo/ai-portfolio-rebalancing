const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/comparison");
  await page
    .getByRole("heading", { name: "Strategy comparison", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Run backtest", exact: true })
    .waitFor();
  await page.getByLabel("ESG threshold", { exact: true }).fill("99");
  await page.getByRole("button", { name: "Run backtest", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Infeasible ESG floor" })
    .waitFor();
  await page.getByLabel("ESG threshold", { exact: true }).fill("65");
  await page.getByLabel("Initial capital (USD)").fill("25000");
  await page.getByLabel("Rebalance frequency").selectOption("monthly");
  async function run() {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/backtests") &&
        r.request().method() === "POST" &&
        r.status() === 202,
    );
    await page
      .getByRole("button", { name: "Run backtest", exact: true })
      .click();
    const created = await (await response).json();
    await page.waitForFunction(
      (id) =>
        document.querySelector(".job-status .chip")?.textContent ===
          "COMPLETED" &&
        document.querySelector(".job-status .job-id")?.textContent === id,
      created.id,
      { timeout: 180000 },
    );
    const result = await (
      await page.request.get(
        `http://127.0.0.1:8000/api/backtests/${created.id}`,
      )
    ).json();
    assert.equal(result.status, "completed");
    return result;
  }
  const baseline = await run();
  assert.equal(baseline.result.results.length, 4);
  // Reuse a real trained pair. If this is a fresh workspace, actually train one via the API.
  let options = await (
    await page.request.get("http://127.0.0.1:8000/api/backtests/options")
  ).json();
  if (!options.experiments.length) {
    const response = await page.request.post(
      "http://127.0.0.1:8000/api/training/jobs",
      { data: { mode: "quick" } },
    );
    assert.equal(response.status(), 202);
    const training = await response.json();
    await page.waitForFunction(
      async (id) => {
        const r = await fetch(`/api/training/jobs/${id}`);
        const j = await r.json();
        if (j.status === "failed") throw Error(j.error);
        return j.status === "trained";
      },
      training.id,
      { timeout: 180000 },
    );
    await page
      .getByRole("button", { name: "Refresh experiments", exact: true })
      .click();
    options = await (
      await page.request.get("http://127.0.0.1:8000/api/backtests/options")
    ).json();
  }
  await page
    .getByLabel("PPO experiment")
    .selectOption(options.experiments[0].id);
  await page.getByLabel("Initial capital (USD)").fill("50000");
  await page.getByLabel("Transaction fee (bps)").fill("20");
  await page.getByLabel("Rebalance frequency").selectOption("weekly");
  await page.getByLabel("ESG threshold", { exact: true }).fill("66");
  await page
    .getByLabel("Apply ESG execution overlay to all strategies")
    .check();
  const completed = await run();
  const result = completed.result;
  assert.equal(result.results.length, 6);
  assert.equal(Object.keys(result.model_sha256).length, 2);
  for (const s of result.results) {
    assert.equal(s.history[0].value, 50000);
    assert.equal(s.esg_constrained, true);
    assert.equal(s.history.length, result.period.returns + 1);
    assert(s.metrics.transaction_costs > 0);
  }
  assert.equal(await page.locator(".backtest-table tbody tr").count(), 6);
  await page.getByLabel("Allocation strategy").selectOption("responsible");
  const checks = page.locator(".strategy-toggles input");
  for (let i = 0; i < 6; i++) await checks.nth(i).uncheck();
  await page
    .getByText("Select at least one strategy to display comparison charts.")
    .waitFor();
  for (let i = 0; i < 6; i++) await checks.nth(i).check();
  const handle = page
    .locator(
      '[aria-label="Strategy cumulative returns"] .recharts-brush-traveller',
    )
    .nth(1);
  const box = await handle.boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 80, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  for (const label of [
    "Export JSON",
    "Export metrics CSV",
    "Export history CSV",
  ]) {
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const file = await downloaded;
    const text = await fs.readFile(await file.path(), "utf8");
    if (label === "Export JSON") assert.deepEqual(JSON.parse(text), result);
    else {
      assert(text.includes("SYNTHETIC PRICES"));
      assert(text.includes("Responsible PPO"));
    }
  }
  await page.screenshot({
    path: path.join(os.tmpdir(), "verdant-phase3-backtest.png"),
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "Computed strategy metrics", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(os.tmpdir(), "verdant-phase3-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Phase 1 baseline comparison", exact: true })
    .click();
  await page.getByRole("heading", { name: "Balanced", exact: true }).waitFor();
  // A real request failure must surface a recoverable error, without a fabricated result.
  await page.route("**/api/backtests/options", (r) =>
    r.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.reload();
  await page.getByRole("alert").waitFor();
  await page.unroute("**/api/backtests/options");
  await page.getByRole("button", { name: "Retry loading" }).click();
  await page
    .getByRole("heading", { name: "Computed strategy metrics", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    `PASS: four/six-strategy real backtests (${completed.id}), constraints, metrics table, chart filters/zoom, allocation selection, three exports, persistence, mobile, baseline tab, failure/retry; no browser exceptions`,
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
