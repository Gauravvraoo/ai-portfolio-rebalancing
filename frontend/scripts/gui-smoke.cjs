const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const exceptions = [];
  page.on("pageerror", (e) => exceptions.push(e.message));
  const routes = [
    ["/", "Your holdings"],
    ["/market", "Dataset details"],
    ["/training", "Training status"],
    ["/rebalance", "Simulation results"],
    ["/comparison", "Saved backtests"],
    ["/reports", "Saved backtest archive"],
  ];
  const audits = [];
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [route, ready] of routes) {
      await page.goto(`http://127.0.0.1:5173${route}`);
      await page.getByRole("heading", { name: ready, exact: true }).waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".skeleton-lines"),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${route} overflows at ${width}px`,
      );
      if (width === 1440 || width === 390) {
        const audit = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        audits.push({ route, width, violations: audit.violations });
      }
    }
  }
  await fs.writeFile(
    path.join(os.tmpdir(), "verdant-phase4-accessibility.json"),
    JSON.stringify(audits, null, 2),
  );
  const violations = audits.flatMap((a) =>
    a.violations.map((v) => ({
      route: a.route,
      width: a.width,
      id: v.id,
      nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
    })),
  );
  assert.deepEqual(
    violations,
    [],
    "Accessibility checks failed; inspect /tmp/verdant-phase4-accessibility.json",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("heading", { name: "Your holdings", exact: true })
    .waitFor();
  const api = await (
    await page.request.get("http://127.0.0.1:8000/api/portfolio")
  ).json();
  const sharpeCard = page
    .locator(".dashboard-kpis .metric")
    .filter({ hasText: "Sharpe ratio" });
  const monthly = api.history
    .slice(1)
    .map((r, i) => r.value / api.history[i].value - 1);
  const mean = monthly.reduce((a, b) => a + b) / monthly.length;
  const std = Math.sqrt(
    monthly.reduce((a, b) => a + (b - mean) ** 2, 0) / (monthly.length - 1),
  );
  assert.equal(
    await sharpeCard.locator(":scope > strong").textContent(),
    ((mean / std) * Math.sqrt(12)).toFixed(2),
  );
  await page.getByRole("button", { name: "3M", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "3M", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Return", exact: true }).click();
  await page
    .getByLabel("Cumulative portfolio return over the sample period")
    .waitFor();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Value", exact: true }).click();
  const activity = page
    .locator(".panel")
    .filter({
      has: page.getByRole("heading", {
        name: "Recent simulated rebalancing",
        exact: true,
      }),
    });
  const runs = await (
    await page.request.get("http://127.0.0.1:8000/api/backtests")
  ).json();
  const latest = runs.find((j) => j.status === "completed");
  if (latest) {
    const actual = await (
      await page.request.get(`http://127.0.0.1:8000/api/backtests/${latest.id}`)
    ).json();
    const selected =
      actual.result.results.find((s) => s.id === "responsible") ||
      actual.result.results[0];
    const events = selected.history
      .filter((p) => p.rebalance)
      .slice(-5)
      .reverse();
    await activity
      .getByText(`Run ${latest.id.slice(0, 8)} · Synthetic Demo`)
      .waitFor();
    assert.equal(
      await activity.locator(".activity-item").count(),
      events.length,
    );
    for (let i = 0; i < events.length; i++)
      assert(
        (
          await activity.locator(".activity-item").nth(i).textContent()
        ).includes(events[i].date),
      );
    await activity.getByRole("link", { name: "View run" }).click();
    await page
      .getByRole("heading", { name: "Computed strategy metrics", exact: true })
      .waitFor();
    assert.equal(await page.getByLabel("Backtest run").inputValue(), latest.id);
  }
  await page.goto("http://127.0.0.1:5173/market");
  await page
    .getByRole("heading", { name: "Dataset details" })
    .waitFor();
  await page.getByLabel("Asset category").selectOption("Cash");
  await page.getByRole("button", { name: /CASH/ }).click();
  await page
    .getByRole("heading", { name: "Choose an asset to compare", exact: true })
    .waitFor();
  await page.getByRole("button", { name: /CASH/ }).click();
  await page.getByLabel("Asset category").selectOption("All assets");
  await page.goto("http://127.0.0.1:5173/rebalance");
  await page.getByRole("button", { name: "Defensive", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("AGG allocation percent", { exact: true })
      .inputValue(),
    "45",
  );
  await page
    .getByRole("button", { name: "Run allocation simulation", exact: true })
    .click();
  await page.getByText("Final value", { exact: true }).waitFor();
  let file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export simulation JSON" }).click();
  assert(
    (await fs.readFile(await (await file).path(), "utf8")).includes(
      "initial_capital",
    ),
  );
  await page.goto("http://127.0.0.1:5173/reports");
  await page
    .getByRole("button", { name: "Download CSV", exact: true })
    .waitFor();
  for (const label of [
    "Download CSV",
    "Download backtest JSON",
    "Download metrics CSV",
    "Download history CSV",
    "Download experiment JSON",
  ]) {
    const button = page.getByRole("button", { name: new RegExp("^" + label) });
    if (await button.count()) {
      file = page.waitForEvent("download");
      await button.click();
      const downloaded = await file;
      assert((await fs.stat(await downloaded.path())).size > 0);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("heading", { name: "Your holdings", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const dialog = page.getByRole("dialog", { name: "Workspace navigation" });
  await dialog.waitFor();
  await page.keyboard.press("Shift+Tab");
  assert(
    await page.evaluate(
      () => document.activeElement.closest("#workspace-navigation") !== null,
    ),
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open navigation" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Open navigation" })
      .evaluate((e) => document.activeElement === e),
    true,
  );
  // Fault injection tests honest empty states; no financial values are fabricated.
  await page.route("**/api/backtests", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Your research starts here", exact: true })
    .waitFor();
  assert.equal(await page.locator(".activity-item").count(), 0);
  await page.unroute("**/api/backtests");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const output = process.env.SCREENSHOT_DIR || path.resolve(__dirname, "../../docs/screenshots/phase4");
  await fs.mkdir(output, { recursive: true });
  for (const [route, filename, ready] of [
    ["/", "dashboard-desktop.png", "Your holdings"],
    ["/comparison", "comparison-desktop.png", "Computed strategy metrics"],
  ]) {
    await page.goto(`http://127.0.0.1:5173${route}`);
    await page.getByRole("heading", { name: ready, exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".skeleton-lines"),
    );
    await page.screenshot({
      path: path.join(output, filename),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, filename, ready] of [
    ["/", "dashboard-mobile.png", "Your holdings"],
    ["/comparison", "comparison-mobile.png", "Computed strategy metrics"],
  ]) {
    await page.goto(`http://127.0.0.1:5173${route}`);
    await page.getByRole("heading", { name: ready, exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".skeleton-lines"),
    );
    await page.screenshot({
      path: path.join(output, filename),
      fullPage: true,
      animations: "disabled",
    });
  }
  assert.deepEqual(exceptions, []);
  console.log(
    "PASS: 18 page/viewport checks; 12 axe WCAG A/AA audits; calculated Sharpe/activity; dashboard and market filters; allocation presets/JSON; report exports; source deep links; mobile focus trap/Escape; empty activity; four final screenshots; no browser exceptions",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
