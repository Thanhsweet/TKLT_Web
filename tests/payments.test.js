import test from "node:test";
import assert from "node:assert/strict";
import { handleBankEvent, bankInfo } from "../lib/payments.js";
function context(booking) {
  const events = new Map(),
    updates = [],
    notices = [];
  let commits = 0,
    rollbacks = 0;
  const c = {
    async beginTransaction() {},
    async commit() {
      commits++;
    },
    async rollback() {
      rollbacks++;
    },
    release() {},
    async execute(sql, params) {
      if (sql.startsWith("INSERT IGNORE INTO payment_events")) {
        if (events.has(params[0])) return [{ affectedRows: 0 }];
        events.set(params[0], params);
        return [{ affectedRows: 1, insertId: events.size }];
      }
      updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  return {
    ctx: {
      pool: {
        async getConnection() {
          return c;
        },
      },
      one: async () => booking,
      notify: async (...args) => notices.push(args),
      audit: async () => {},
    },
    events,
    updates,
    notices,
    get commits() {
      return commits;
    },
    get rollbacks() {
      return rollbacks;
    },
  };
}
const body = {
  id: 999,
  transferType: "in",
  transferAmount: 320000,
  accountNumber: "123456789",
  content: "N01AABBCCDD11223344 thanh toan",
};
const booking = {
  id: 10,
  booking_code: "N01-AABBCCDD11223344",
  payment_id: 20,
  user_id: 1,
  status: "pending",
  payment_status: "pending",
  provider: "bank_transfer",
  active_hold: 1,
  total_amount: 320000,
  account_number: "123456789",
};
test("bank webhook commits a matching payment once, duplicate event cannot pay again", async () => {
  process.env.SEPAY_WEBHOOK_KEY = "unit-secret";
  const req = { headers: { authorization: "Apikey unit-secret" } },
    s = context(booking);
  assert.deepEqual(await handleBankEvent(req, body, s.ctx), { success: true });
  assert.equal(
    s.updates.filter((x) => x.sql.startsWith("UPDATE payments")).length,
    1,
  );
  assert.equal(s.updates.at(-1).params[1], "processed");
  await handleBankEvent(req, body, s.ctx);
  assert.equal(
    s.updates.filter((x) => x.sql.startsWith("UPDATE payments")).length,
    1,
  );
  assert.equal(s.notices.length, 1);
  assert.equal(s.commits, 2);
});
test("wrong amount, wrong recipient or expired hold never confirm the booking", async () => {
  process.env.SEPAY_WEBHOOK_KEY = "unit-secret";
  const req = { headers: { authorization: "Apikey unit-secret" } };
  for (const [b, event] of [
    [booking, { ...body, transferAmount: 1 }],
    [booking, { ...body, accountNumber: "another-account" }],
    [{ ...booking, active_hold: 0 }, body],
  ]) {
    const s = context(b);
    await handleBankEvent(req, event, s.ctx);
    assert.equal(
      s.updates.filter((x) => x.sql.startsWith("UPDATE payments")).length,
      0,
    );
    assert.notEqual(s.updates.at(-1).params[1], "processed");
    assert.equal(s.rollbacks, 0);
  }
});
test("QR uses booked total and normalized code, never client amount", async () => {
  const bank = await bankInfo({ ...booking, court_id: 1 }, async () => ({
    bank_code: "VCB",
    account_number: "123456789",
    account_name: "TEST",
  }));
  const url = new URL(bank.qr_url);
  assert.equal(url.searchParams.get("amount"), "320000");
  assert.equal(url.searchParams.get("des"), "N01AABBCCDD11223344");
});
