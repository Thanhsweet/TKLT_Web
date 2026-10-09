import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function portalFixture() {
  const elements = new Map(), calls = [];
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, {
      value: "", innerHTML: "", textContent: "", hidden: false, disabled: false,
      handlers: {}, elements: [],
      addEventListener(name, fn) { this.handlers[name] = fn; },
      setAttribute() {}, removeAttribute() {}, focus() {},
      querySelectorAll: () => [],
      insertAdjacentHTML(_, html) { this.innerHTML += html; },
      showModal() { this.open = true; }, close() { this.open = false; },
    });
    return elements.get(selector);
  };
  let available = true;
  const slot = { start_at: "2030-01-02T08:00:00", end_at: "2030-01-02T09:00:00", label: "08:00 – 09:00", price: 100000, available: true };
  const user = { role: "receptionist", full_name: "Lễ Tân" };
  const context = {
    document: { querySelector: element, addEventListener() {} },
    window: { addEventListener() {} }, location: { hash: "#work" },
    URLSearchParams, Intl, Date, clearInterval() {}, clearTimeout() {}, setTimeout() {},
    fetch: async (path, options = {}) => {
      calls.push({ path, options });
      let data = {};
      if (path === "/api/staff/courts") data = { courts: [{ id: 9, name: "Sân A", venue_name: "Cơ sở A" }] };
      if (path.includes("/slots?")) data = { slots: available ? [slot, { ...slot, start_at: "2030-01-02T09:00:00", available: false }] : [] };
      if (path === "/api/csrf") data = { token: "csrf-fixture" };
      if (path === "/api/auth/me") data = { user };
      if (path.startsWith("/api/manage/bookings?")) data = { bookings: [] };
      return { ok: true, json: async () => data };
    },
  };
  const source = readFileSync(new URL("../public/js/portal.js", import.meta.url), "utf8");
  runInNewContext(source.slice(0, source.lastIndexOf("boot().catch")) +
    "\nglobalThis.portal = { reception, walkInBooking, setUser(value) { user = value; } };", context);
  context.portal.setUser(user);
  element("#field-court_id").value = "9";
  element("#field-date").value = "2030-01-02";
  return { element, calls, slot, portal: context.portal, setAvailable(value) { available = value; } };
}

test("portal lễ tân chọn giờ trống và đặt khách tại quầy với CSRF, giữ ngày tra cứu", async () => {
  const app = portalFixture();
  await app.portal.reception("2030-01-02");
  assert.match(app.element("#actions").innerHTML, /Đặt sân tại quầy/);
  await app.portal.walkInBooking("2030-01-02");
  assert.equal(app.element("#editor").open, true);
  assert.match(app.element("#fields").innerHTML, /Tên khách/);
  assert.match(app.element("#field-slot").innerHTML, /08:00/);
  assert.doesNotMatch(app.element("#field-slot").innerHTML, /T09:00/);
  const body = { court_id: "9", date: "2030-01-02", slot: app.slot.start_at, guest_name: " Khách tại quầy ", guest_phone: "0901234567", payment_method: "unpaid", note: "" };
  app.element("#editor-form").elements = Object.entries(body).map(([name, value]) => ({ name, value }));
  await app.element("#editor-form").handlers.submit({ preventDefault() {}, submitter: {} });
  const sent = app.calls.find((c) => c.path === "/api/staff/bookings");
  assert.ok(sent);
  assert.equal(sent.options.headers["X-CSRF-Token"], "csrf-fixture");
  const data = JSON.parse(sent.options.body);
  assert.equal(data.guest_name, "Khách tại quầy");
  assert.equal(data.court_id, 9);
  assert.equal(data.end_at, app.slot.end_at);
  assert.equal(data.payment_method, "unpaid");
  assert.equal(app.element("#editor").open, false);
  assert.ok(app.calls.at(-1).path.includes("date=2030-01-02"));
});

test("portal không tạo đơn khi không còn khung giờ trống", async () => {
  const app = portalFixture();
  app.setAvailable(false);
  await app.portal.walkInBooking("2030-01-02");
  assert.equal(app.element("#field-slot").disabled, true);
  app.element("#editor-form").elements = [{ name: "slot", value: app.slot.start_at }];
  await app.element("#editor-form").handlers.submit({ preventDefault() {}, submitter: {} });
  assert.equal(app.calls.some((c) => c.path === "/api/staff/bookings"), false);
  assert.equal(app.element("#form-error").hidden, false);
  assert.equal(app.element("#editor").open, true);
});
