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
    await page.waitForSelector("#navigation a", { state: "attached" });
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
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      ) {
        console.log(
          "Overflow",
          email,
          hash,
          await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
              .map((e) => [
                e.tagName,
                e.className,
                e.getBoundingClientRect().right,
              ])
              .slice(0, 20),
          ),
        );
        await page.screenshot({
          path: "test-results/overflow.png",
          fullPage: true,
        });
      }
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
  // Redesign acceptance: real images, responsive pages, discovery filters and booking.
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const path of ["/", "/court.html?id=1", "/policies.html"]) {
      await page.goto(base + path);
      if (path === "/") await page.waitForSelector(".court-card");
      if (path.includes("court.html"))
        await page.waitForSelector(".detail-booking");
      await page.evaluate(() =>
        Promise.all(
          [...document.images].map((i) =>
            i.complete
              ? Promise.resolve()
              : new Promise((r) => {
                  i.onload = r;
                  i.onerror = r;
                }),
          ),
        ),
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        path + " overflow at " + width,
      );
      assert.equal(
        await page
          .locator("img")
          .evaluateAll(
            (imgs) =>
              imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
          ),
        0,
        "Broken images on " + path,
      );
      if (width === 375 || width === 1440)
        await page.screenshot({
          path: `test-results/redesign-${path === "/" ? "home" : path.includes("court") ? "court" : "policy"}-${width}.png`,
          fullPage: true,
        });
    }
  }
  const detail = await (
    await context.request.get(base + "/api/courts/1")
  ).json();
  assert.equal(detail.court.sport_slug, "bong-da");
  assert.ok(Array.isArray(detail.court.amenities));
  await page.goto(base + "/");
  await page.waitForSelector(".court-card");
  const initialCount = await page.locator(".court-card").count();
  await page.locator("#sort-select").selectOption("price-asc");
  const prices = await page.locator(".price strong").allTextContents();
  const values = prices.map((p) =>
    Number(p.split("₫")[0].replace(/[^0-9]/g, "")),
  );
  assert.deepEqual(
    values,
    [...values].sort((a, b) => a - b),
  );
  await page.locator("#budget-filter").selectOption("200000");
  assert.ok(
    (await page.locator(".court-card").count()) < initialCount,
    "Budget filter reduces results",
  );
  await page.locator("#indoor-filter").selectOption("indoor");
  for (const badge of await page.locator(".art-badge").allTextContents())
    assert.equal(badge, "Trong nhà");
  await page.locator("#reset-filters").click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".court-card").length === count,
    initialCount,
  );
  // A real owner overview and mobile navigation.
  await context.clearCookies();
  await page.goto(base + "/account.html");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("chusan@n01sport.vn");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("ChuSan@123");
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page.waitForSelector(".overview-metrics");
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 950 });
    await page.screenshot({
      path: `test-results/redesign-owner-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await page.locator("#nav-toggle").click();
  await page.locator('#navigation a[href="#courts"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector("#title").textContent === "Sân thể thao" &&
      document.querySelector("#view").getAttribute("aria-busy") === "false",
  );
  assert.equal(
    await page.locator("#nav-toggle").getAttribute("aria-expanded"),
    "false",
  );
  // Guest chooses a slot, logs in and resumes the booking; confirmation uses real MySQL.
  await context.clearCookies();
  await page.goto(base + "/?court_id=1#courts");
  await page.waitForSelector("#booking-dialog[open]");
  const date = new Date();
  date.setDate(date.getDate() + 17);
  const day = date.toISOString().slice(0, 10);
  await page.locator("#booking-date").fill(day);
  await page.locator("#booking-date").dispatchEvent("change");
  await page.waitForFunction(
    () =>
      document.querySelector("#slot-grid").getAttribute("aria-busy") ===
      "false",
  );
  await page.locator(".slot-button:not(:disabled)").first().click();
  await page.locator("#confirm-booking").click();
  await page.waitForSelector("#login-dialog[open]");
  await page.locator("#login-email").fill("khach@n01sport.vn");
  await page.locator("#login-password").fill("Khach@123");
  await page.locator("#login-form button[type=submit]").click();
  await page.waitForSelector("#booking-dialog[open]");
  await page.waitForFunction(
    () =>
      document.querySelector("#slot-grid").getAttribute("aria-busy") ===
      "false",
  );
  assert.equal(await page.locator("#booking-date").inputValue(), day);
  await page.locator(".slot-button:not(:disabled)").first().click();
  await page.screenshot({
    path: "test-results/redesign-booking-375.png",
    fullPage: true,
  });
  await page.locator("#confirm-booking").click();
  await page.waitForSelector("#success-dialog[open]");
  assert.match(await page.locator("#success-code").innerText(), /^N01-/);
  console.log(
    "Redesign: 4 viewport widths, image loading, filters/sorting/reset, court details, owner overview, mobile menu, guest login resume and real booking passed.",
  );
  assert.deepEqual(errors, []);
  console.log(
    `Live Chromium + MySQL: ${screens} authenticated screens, 7 roles, 375px, public pages 1440px, no API 500 or JS errors.`,
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await pool.end();
}
