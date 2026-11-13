// Start the explicit historical fixture harness and Vite. Alpaca ticks below are
// MOCKED TEST EVENTS ONLY; they do not demonstrate a live exchange connection.
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
    // Real internal WebSocket + Vite proxy, with absent credentials: no mocked server.
    await page.goto("http://127.0.0.1:5173/market");
    const watch = page.getByRole("region", {
      name: "Real-Time ETF Market Watch",
      exact: true,
    });
    await watch.getByText(/Set ALPACA_API_KEY and ALPACA_API_SECRET/).waitFor();
    await watch
      .getByRole("status")
      .filter({ hasText: /^Unavailable$/ })
      .waitFor();
    assert.equal(await watch.locator("article").count(), 4);
    assert.equal(await watch.getByText("—", { exact: true }).count(), 4);
    let socket,
      closed = 0,
      connections = 0;
    const fixture = {
      type: "snapshot",
      provider: "Alpaca Market Data",
      feed: "iex",
      connection_state: "connecting",
      subscription_confirmed: false,
      quotes: {},
      market: null,
      message: "MOCKED TEST EVENTS — not a live Alpaca/exchange connection",
    };
    await context.routeWebSocket("**/api/market/stream", (ws) => {
      socket = ws;
      connections++;
      ws.onClose(() => {
        closed++;
      });
      ws.send(JSON.stringify(fixture));
    });
    await page.reload();
    await watch.getByText("Connecting", { exact: true }).waitFor();
    fixture.connection_state = "connected";
    fixture.subscription_confirmed = true;
    socket.send(JSON.stringify(fixture));
    await watch.getByText("IEX Real-Time", { exact: true }).waitFor();
    assert.equal(
      await watch.getByText("No recent trades", { exact: true }).count(),
      4,
    );
    fixture.quotes.SPY = {
      symbol: "SPY",
      price: 123.45,
      feed: "iex",
      exchange_timestamp: new Date().toISOString(),
      received_at: new Date().toISOString(),
    };
    socket.send(JSON.stringify(fixture));
    await watch.getByText("$123.45", { exact: true }).waitFor();
    await watch.getByText("Recent exchange trade", { exact: true }).waitFor();
    assert((await watch.innerText()).includes("not full US market coverage"));
    fixture.quotes.SPY.exchange_timestamp = new Date(
      Date.now() - 120000,
    ).toISOString();
    socket.send(JSON.stringify(fixture));
    await watch
      .getByText("Recent exchange trade", { exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      await watch.getByText("No recent trades", { exact: true }).count(),
      4,
    );
    fixture.feed = "sip";
    fixture.connection_state = "unavailable";
    fixture.subscription_confirmed = false;
    fixture.error_code = "subscription_denied";
    fixture.message =
      "MOCK subscription denial: SIP unavailable; no feed fallback used.";
    socket.send(JSON.stringify(fixture));
    await watch
      .getByRole("status")
      .filter({ hasText: /^Unavailable$/ })
      .waitFor();
    assert.equal(
      await watch.getByText("SIP Real-Time", { exact: true }).count(),
      0,
    );
    await watch
      .getByText("Stale trade · disconnected", { exact: true })
      .waitFor();
    fixture.connection_state = "reconnecting";
    socket.send(JSON.stringify(fixture));
    await watch.getByText("Reconnecting", { exact: true }).waitFor();
    fixture.connection_state = "connected";
    fixture.subscription_confirmed = true;
    fixture.quotes = {};
    fixture.message =
      "MOCKED TEST EVENTS — not a live Alpaca/exchange connection";
    fixture.market = {
      is_open: false,
      checked_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      next_open: new Date(Date.now() + 86400000).toISOString(),
      next_close: new Date(Date.now() + 108000000).toISOString(),
    };
    socket.send(JSON.stringify(fixture));
    await watch.getByText("SIP Real-Time", { exact: true }).waitFor();
    await watch
      .getByText("Market Closed · regular session", { exact: true })
      .waitFor();
    // A different historical source/range must not restart the independent socket.
    const before = connections;
    await page.getByLabel("Data source", { exact: true }).selectOption("real");
    await page
      .getByRole("heading", { name: "Historical Market Data", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "1Y", exact: true }).click();
    await page.getByText("1Y selected window", { exact: true }).waitFor();
    assert.equal(connections, before);
    assert.equal(
      await page.locator(".market-asset-grid .asset-card-value").count(),
      5,
    );
    await page
      .getByRole("heading", { name: "Daily return correlations" })
      .waitFor();
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        audit.violations.map((v) => v.id),
        [],
      );
      if (width !== 820)
        await watch.screenshot({
          path: `/tmp/verdant-alpaca-watch-MOCK-${width}.png`,
        });
    }
    // Visibility cleanup using an explicit browser-test visibility event.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await watch
      .getByText("Disconnected · page hidden", { exact: true })
      .waitFor();
    await page.waitForFunction(() => true);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await watch.getByText("SIP Real-Time", { exact: true }).waitFor();
    assert.equal(connections, before + 1);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const priorClosed = closed;
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.locator(".dashboard-kpis .metric").first().waitFor();
    assert.equal(await page.locator(".dashboard-kpis .metric").count(), 6);
    assert.equal(await page.locator(".source-controls").count(), 0);
    assert.equal(
      await page
        .getByRole("heading", { name: "Real-Time ETF Market Watch" })
        .count(),
      0,
    );
    assert(
      await page
        .locator(".page-title")
        .evaluate(
          (el) =>
            el === document.querySelector(".page-content").firstElementChild &&
            el.nextElementSibling.matches(".dashboard-kpis"),
        ),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "/tmp/verdant-alpaca-unchanged-dashboard.png",
      fullPage: true,
    });
    assert(
      closed > priorClosed,
      "Market socket closes when leaving Market Analysis",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: actual internal missing-credential WebSocket through Vite; MOCKED connecting/IEX trades/stale/SIP denial/reconnecting/closed states; independent historical controls; visibility/unmount cleanup; preserved Dashboard; three responsive WCAG audits. NO live Alpaca connectivity claimed.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
