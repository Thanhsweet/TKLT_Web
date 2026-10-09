import test from "node:test";
import assert from "node:assert/strict";
import { validateSlot, dateTime, integer } from "../lib/validation.js";
import { guardRequest, csrfFor } from "../lib/http-security.js";
import { authenticateWebhook } from "../lib/payments.js";
const court = {
  open_time: "05:30:00",
  close_time: "22:30:00",
  slot_minutes: 60,
};
const now = Date.parse("2026-10-09T10:00:00+07:00");
test("booking follows Vietnamese opening hours, slot alignment and future date", () => {
  assert.deepEqual(
    validateSlot(court, "2026-10-10T17:30", "2026-10-10T18:30", now),
    ["2026-10-10 17:30:00", "2026-10-10 18:30:00"],
  );
  for (const [a, b] of [
    ["2026-10-08 17:30:00", "2026-10-08 18:30:00"],
    ["2026-10-10 04:30:00", "2026-10-10 05:30:00"],
    ["2026-10-10 22:30:00", "2026-10-10 23:30:00"],
    ["2026-10-10 17:00:00", "2026-10-10 18:00:00"],
    ["2026-10-10 17:30:00", "2026-10-10 19:30:00"],
    ["2026-10-10 17:30:01", "2026-10-10 18:30:01"],
    ["2026-10-10 21:30:00", "2026-10-11 22:30:00"],
  ])
    assert.throws(() => validateSlot(court, a, b, now));
});
test("reject nonexistent dates and unsafe numbers", () => {
  for (const s of [
    "2026-02-30T12:00",
    "2026-13-01T12:00",
    "2026-10-10T25:00",
    "hello",
  ])
    assert.throws(() => dateTime(s));
  for (const n of [-1, 1.5, Infinity, NaN, "1e30"])
    assert.throws(() => integer(n, "Số"));
});
test("cross-origin and missing CSRF requests cannot change authenticated data", () => {
  const prev = process.env.PUBLIC_URL;
  process.env.PUBLIC_URL = "https://n01.example";
  const cookie = { n01_session: "secret-session" },
    req = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
    };
  assert.throws(
    () => guardRequest(req, "/api/orders", cookie),
    (e) => e.status === 403,
  );
  req.headers.origin = "https://n01.example";
  assert.throws(
    () => guardRequest(req, "/api/orders", cookie),
    (e) => e.status === 403,
  );
  req.headers["x-csrf-token"] = csrfFor(cookie.n01_session);
  assert.doesNotThrow(() => guardRequest(req, "/api/orders", cookie));
  if (prev === undefined) delete process.env.PUBLIC_URL;
  else process.env.PUBLIC_URL = prev;
});
test("webhook requires exact secret and fails closed if unconfigured", () => {
  const prev = process.env.SEPAY_WEBHOOK_KEY;
  delete process.env.SEPAY_WEBHOOK_KEY;
  assert.throws(
    () => authenticateWebhook({ headers: {} }),
    (e) => e.status === 401,
  );
  process.env.SEPAY_WEBHOOK_KEY = "a-real-secret";
  assert.throws(() =>
    authenticateWebhook({ headers: { authorization: "Apikey bad" } }),
  );
  assert.doesNotThrow(() =>
    authenticateWebhook({ headers: { authorization: "Apikey a-real-secret" } }),
  );
  if (prev === undefined) delete process.env.SEPAY_WEBHOOK_KEY;
  else process.env.SEPAY_WEBHOOK_KEY = prev;
});
