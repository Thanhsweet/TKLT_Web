// Browser/layout smoke test with explicit API fixtures; does not replace MySQL integration tests.
import { chromium as playwright } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
const { server } = await import("../server.js");
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await playwright.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE || (await chromium.executablePath()),
  args: chromium.args,
  headless: true,
});
mkdirSync("test-results", { recursive: true });
const errors = [];
const venues = [
  {
    id: 1,
    name: "N01 Arena Hải Châu",
    address: "18 Nguyễn Văn Linh",
    district: "Hải Châu",
    city: "Đà Nẵng",
    open_time: "05:00:00",
    close_time: "23:00:00",
    latitude: 16.0605,
    longitude: 108.2208,
    status: "active",
  },
];
const sports = [
  { id: 1, slug: "bong-da", name: "Bóng đá" },
  { id: 2, slug: "cau-long", name: "Cầu lông" },
];
const courts = [
  {
    id: 1,
    venue_id: 1,
    name: "Sân bóng A1",
    surface: "Cỏ nhân tạo",
    capacity: 14,
    indoor: false,
    base_price: 320000,
    slot_minutes: 60,
    sport_slug: "bong-da",
    sport_name: "Bóng đá",
    venue_name: venues[0].name,
    address: venues[0].address,
    district: "Hải Châu",
    rating: 4.9,
    amenities: ["Bãi xe", "Phòng thay đồ"],
    status: "active",
  },
];
let role = "customer",
  settings = [];
const fixture = (url) => {
  const u = {
    id: 1,
    full_name: "Nguyễn Minh Anh",
    email: "minhanh@example.com",
    phone: "0901234567",
    role,
    loyalty_points: 240,
  };
  const path = new URL(url).pathname;
  if (path === "/api/config") return { demo: false, settings };
  if (path === "/api/auth/me") return { user: u };
  if (path === "/api/csrf") return { token: "fixture-token" };
  if (path === "/api/bootstrap")
    return { user: u, sports, districts: ["Hải Châu"] };
  if (path === "/api/courts") return { courts };
  if (path === "/api/portal/options")
    return { venues, courts, sports, publicVenues: venues };
  if (path === "/api/manage/venues") return { rows: venues };
  if (path === "/api/manage/courts") return { rows: courts };
  if (path === "/api/manage/prices")
    return {
      rows: [
        {
          id: 1,
          court_id: 1,
          name: "Giờ vàng",
          day_of_week: 1,
          start_time: "17:00:00",
          end_time: "21:00:00",
          price: 380000,
          active: true,
        },
      ],
    };
  if (path === "/api/manage/settings") return { rows: settings };
  if (path.startsWith("/api/manage/")) return { rows: [], bookings: [] };
  if (path === "/api/bookings")
    return {
      bookings: [
        {
          id: 1,
          booking_code: "N01-AABBCCDD11223344",
          court_name: "Sân bóng A1",
          start_at: "2026-10-10 18:00:00",
          end_at: "2026-10-10 19:00:00",
          total_amount: 320000,
          status: "confirmed",
          payment_status: "paid",
        },
      ],
    };
  if (path === "/api/notifications")
    return {
      notifications: [
        {
          id: 1,
          title: "Đặt sân đã xác nhận",
          message: "Booking của bạn đã được thanh toán.",
          created_at: "2026-10-09 11:00:00",
          read_at: null,
        },
      ],
    };
  if (path === "/api/account/loyalty")
    return { points: 240, history: [], rewards: [], coupons: [] };
  if (path === "/api/support") return { tickets: [] };
  if (path === "/api/orders") return { orders: [], items: [] };
  if (path === "/api/owner/dashboard")
    return {
      metrics: { collected: 0, courts: 1 },
      recent: [],
      courts,
      promotions: [],
      staff: [],
      services: [],
      maintenance: [],
      refunds: [],
    };
  if (path === "/api/admin/dashboard")
    return { venues, users: [], audit: [], metrics: {} };
  if (path === "/api/staff/dashboard")
    return { role, assignments: [], work: [] };
  if (path === "/api/coach/schedules") return { schedules: [] };
  if (path === "/api/reports")
    return { daily: [], services: [], courts: [], hours: [], customers: [] };
  if (path === "/api/transactions") return { transactions: [] };
  if (path === "/api/admin/payment-events") return { events: [] };
  if (path === "/api/admin/backups") return { backups: [] };
  return { ok: true };
};
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    if (
      route.request().method() === "POST" &&
      new URL(route.request().url()).pathname === "/api/manage/settings"
    ) {
      const b = route.request().postDataJSON();
      settings.push(b);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture(route.request().url())),
    });
  });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto(base + "/");
    await page.waitForSelector("[data-book-court]");
    assert.ok(await page.locator("[data-book-court]").isVisible());
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Homepage overflows viewport",
    );
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
    await page.goto(base + "/account.html#bookings");
    await page.waitForSelector("tbody tr");
    assert.ok(await page.getByText("N01-AABBCCDD11223344").isVisible());
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Portal overflows viewport",
    );
    await page.screenshot({
      path: `test-results/account-${width}.png`,
      fullPage: true,
    });
  }
  role = "owner";
  await page.goto(base + "/account.html#prices");
  await page.waitForSelector("tbody tr");
  await page.getByRole("button", { name: "Thêm mới", exact: true }).click();
  await page.waitForSelector("dialog[open]");
  assert.ok(
    await page.getByLabel("Giá mỗi slot (đ)", { exact: true }).isVisible(),
  );
  await page.screenshot({
    path: "test-results/price-form-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  for (const r of ["admin", "coach", "receptionist", "technician", "cleaner"]) {
    role = r;
    await page.goto(base + "/account.html");
    await page.waitForFunction(
      () =>
        !document.querySelector("#view").getAttribute("aria-busy") ||
        document.querySelector("#view").getAttribute("aria-busy") === "false",
    );
    assert.ok((await page.locator("#navigation a").count()) >= 3);
  }
  role = "admin";
  await page.goto(base + "/account.html#settings");
  await page.getByRole("button", { name: "Thêm mới", exact: true }).click();
  await page.getByLabel("Nội dung", { exact: true }).fill("N01SPORT");
  await page.getByRole("button", { name: "Lưu thông tin" }).click();
  await page.waitForFunction(() =>
    document.querySelector("#view").textContent.includes("N01SPORT"),
  );
  assert.equal(settings.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "UI fixtures: 7 roles, 375/1440px, resource form submission, no page errors.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
