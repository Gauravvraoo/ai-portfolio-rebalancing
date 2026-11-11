const { chromium } = require("playwright");
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
  await page.goto("http://127.0.0.1:5173");
  await page.getByText("Your holdings", { exact: true }).waitFor();
  for (const [label, heading] of [
    ["Market Analysis", "Market analysis"],
    ["AI Agent Training", "AI agent training"],
    ["Portfolio Rebalancing", "Portfolio rebalancing"],
    ["Strategy Comparison", "Strategy comparison"],
    ["Reports", "Reports"],
  ]) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== "verdant-simulation.csv")
    throw Error("CSV download missing");
  await page
    .getByRole("link", { name: "Portfolio Rebalancing", exact: true })
    .click();
  await page.getByRole("button", { name: "Run allocation simulation" }).click();
  await page.getByText("Final value", { exact: true }).waitFor();
  await page.getByLabel("SPY allocation percent").fill("30");
  if (
    !(await page
      .getByRole("button", { name: "Run allocation simulation" })
      .isDisabled())
  )
    throw Error("Invalid allocation not blocked");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173");
  await page.getByText("Your holdings", { exact: true }).waitFor();
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Mobile page overflows");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("link", { name: "Market Analysis", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Market analysis", exact: true })
    .waitFor();
  await page.route("**/api/portfolio", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("alert").waitFor();
  await page.unroute("**/api/portfolio");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByText("Your holdings", { exact: true }).waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: six routes, simulation, invalid weights, CSV download, mobile navigation/layout, API failure/retry; no browser exceptions",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
