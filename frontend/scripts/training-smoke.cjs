const os = require("node:os");
const path = require("node:path");
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
  await page.goto("http://127.0.0.1:5173/training");
  await page
    .getByRole("button", { name: "Train both PPO agents", exact: true })
    .waitFor();
  await page.getByLabel("Responsible ESG floor").fill("99");
  await page
    .getByRole("button", { name: "Train both PPO agents", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Infeasible ESG floor" })
    .waitFor();
  await page.getByLabel("Responsible ESG floor").fill("65");
  const started = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/training/jobs") &&
      r.request().method() === "POST" &&
      r.status() === 202,
  );
  await page
    .getByRole("button", { name: "Train both PPO agents", exact: true })
    .click();
  const job = await (await started).json();
  const evaluate = page.getByRole("button", {
    name: "Evaluate saved models on test split",
  });
  await require("node:assert").strict.doesNotReject(async () => {
    await page.waitForFunction(
      () =>
        document.querySelector(".job-status .chip")?.textContent === "TRAINED",
      null,
      { timeout: 180000 },
    );
  });
  await page
    .getByRole("heading", { name: "Profit PPO · learning curves" })
    .waitFor();
  await page
    .getByRole("heading", { name: "Responsible PPO · learning curves" })
    .waitFor();
  await evaluate.click();
  await page
    .getByRole("heading", { name: "Held-out test evaluation" })
    .waitFor({ timeout: 60000 });
  const status = await page.request.get(
    `http://127.0.0.1:8000/api/training/jobs/${job.id}`,
  );
  const result = await status.json();
  if (
    result.status !== "completed" ||
    !result.evaluation?.responsible?.history.length
  )
    throw Error("Real evaluation unavailable");
  await page.reload();
  await page
    .getByRole("heading", { name: "Held-out test evaluation" })
    .waitFor();
  await page.screenshot({
    path: path.join(os.tmpdir(), "verdant-phase2-training.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Training page mobile overflow");
  await page.screenshot({
    path: path.join(os.tmpdir(), "verdant-phase2-mobile.png"),
    fullPage: true,
  });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    `PASS: infeasible settings, actual two-agent job ${job.id}, status polling, training charts, held-out evaluation, persisted reload, mobile layout; no browser exceptions`,
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
