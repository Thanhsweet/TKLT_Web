// Uses real API and real MySQL; test DB only. Run after db:demo.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium as playwright } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import "dotenv/config";
if (!process.env.DB_NAME?.endsWith("_test"))
  throw Error("Requires a database ending in _test.");
process.env.NODE_ENV = "test";
const { server } = await import("../server.js");
const { default: pool } = await import("../database/mysql.js");
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await playwright.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE || (await chromium.executablePath()),
  args: chromium.args.filter((a) => !a.includes("disable-web-security")),
  headless: true,
});
mkdirSync("test-results", { recursive: true });
let screens = 0;
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500)
      errors.push(r.status() + ":" + r.url());
  });
  for (const [email, password] of [
    ["khach@n01sport.vn", "Khach@123"],
    ["chusan@n01sport.vn", "ChuSan@123"],
    ["admin@n01sport.vn", "Admin@123"],
    ["letan@n01sport.vn", "LeTan@123"],
    ["kythuat@n01sport.vn", "KyThuat@123"],
    ["vesinh@n01sport.vn", "VeSinh@123"],
    ["hlv@n01sport.vn", "HLV@12345"],
  ]) {
    await context.clearCookies();
    await page.goto(base + "/account.html");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Lưu thông tin", exact: true })
      .click();
    await page.waitForSelector("#navigation a");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    const links = await page
      .locator("#navigation a")
      .evaluateAll((a) => a.map((x) => x.getAttribute("href")));
    for (const hash of links) {
      await page.goto(base + "/account.html" + hash);
      await page.waitForFunction(
        () =>
          document.querySelector("#view").getAttribute("aria-busy") === "false",
      );
      assert.equal(
        await page.locator("#view [role=alert]").count(),
        0,
        email + " " + hash + ": " + (await page.locator("#view").innerText()),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        email + " " + hash + " overflows",
      );
      screens++;
    }
    await page.screenshot({
      path: "test-results/live-" + email.split("@")[0] + ".png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/");
  await page.waitForSelector(".court-card");
  await page.screenshot({ path: "test-results/live-home.png", fullPage: true });
  await page.goto(base + "/court.html?id=1");
  await page.waitForFunction(
    () => !document.body.textContent.includes("Đang tải"),
  );
  assert.ok(!(await page.locator("body").innerText()).includes("Lỗi máy chủ"));
  assert.deepEqual(errors, []);
  console.log(
    `Live Chromium + MySQL: ${screens} authenticated screens, 7 roles, 375px, public pages 1440px, no API 500 or JS errors.`,
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await pool.end();
}
