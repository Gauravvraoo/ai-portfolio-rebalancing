// Uses the explicitly labeled backend provider fixture; no external download claimed.
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/");
    const card = page.locator(".historical-intelligence");
    await page
      .getByRole("heading", { name: "Historical Market Intelligence" })
      .waitFor();
    await page.locator(".dashboard-kpis .metric").first().waitFor();
    const baseline = await page.locator(".dashboard-kpis").innerText();
    assert.equal(await card.locator(".intelligence-metric").count(), 0);
    assert.equal(
      await card.locator(".intelligence-status").innerText(),
      "Synthetic demo",
    );
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const held = async (route) => {
      await gate;
      await route.continue();
    };
    await page.route("**/api/market?**", held);
    const response = page.waitForResponse(
      (r) => r.url().includes("/api/market?") && r.status() === 200,
    );
    await page.getByLabel("Data source", { exact: true }).selectOption("real");
    await card.getByText("Loading", { exact: true }).waitFor();
    assert.equal(await card.locator(".intelligence-metric").count(), 0);
    release();
    const market = await (await response).json();
    await card.getByText("Loaded", { exact: true }).waitFor();
    await page.unroute("**/api/market?**", held);
    assert.equal(await card.locator(".intelligence-metric").count(), 4);
    assert(
      (await card.innerText()).includes(
        market.history.length.toLocaleString("en-US"),
      ),
    );
    assert((await card.innerText()).includes("SPY · AGG · GLD · QQQ"));
    assert((await card.innerText()).includes(market.data.provider));
    assert((await card.innerText()).includes(market.data.price_adjustment));
    assert.equal(await page.locator(".dashboard-kpis").innerText(), baseline);
    assert(
      await card.evaluate(
        (el) =>
          !!(
            el.compareDocumentPosition(
              document.querySelector(".dashboard-kpis"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    );
    const desktop = await card.boundingBox();
    console.log(`Desktop intelligence card: ${Math.round(desktop.height)}px`);
    assert(desktop.height >= 250 && desktop.height <= 330);
    await page.getByLabel("Market cash annual yield (%)").fill("3.5");
    await card.getByText("3.5%", { exact: true }).waitFor();
    await page.getByLabel("Historical date range").selectOption("1Y");
    await card.getByText(/1Y window/).waitFor();
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const audit = await new AxeBuilder({ page })
        .include(".historical-intelligence")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        audit.violations.map((v) => v.id),
        [],
      );
      if (width !== 820)
        await card.screenshot({
          path: `/tmp/verdant-intelligence-${width}.png`,
        });
    }
    await card.getByRole("link", { name: "Explore Market Analysis" }).click();
    await page.waitForURL("**/market");
    await page.goto("http://127.0.0.1:5173/");
    await card.getByText("Loaded", { exact: true }).waitFor();
    await page.route("**/api/market?**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Provider unavailable. No synthetic fallback was used.",
        }),
      }),
    );
    await page.reload();
    await card.getByRole("alert").waitFor();
    assert.equal(
      await card.locator(".intelligence-status").innerText(),
      "Provider error",
    );
    assert.equal(await card.locator(".intelligence-metric").count(), 0);
    await page.unroute("**/api/market?**");
    await card.getByRole("button", { name: "Retry historical data" }).click();
    await card.getByText("Loaded", { exact: true }).waitFor();
    await page.route("**/api/market?**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { data_source: "real" },
          history: [],
          assets: [],
        }),
      }),
    );
    await page.reload();
    await card.getByText("Unavailable", { exact: true }).waitFor();
    assert.equal(await card.locator(".intelligence-metric").count(), 0);
    await page
      .getByLabel("Data source", { exact: true })
      .selectOption("synthetic");
    await card.getByText("Synthetic demo", { exact: true }).waitFor();
    assert.equal(await page.locator(".dashboard-kpis").innerText(), baseline);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: synthetic/loading/loaded/empty/provider-error/retry states, endpoint metrics, configured cash yield, range, unchanged KPIs, Market link, three responsive layouts and accessibility audits",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
