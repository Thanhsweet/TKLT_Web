// Executes against an isolated real MySQL database only, never against a production name.
import test from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { operationsTests } from "./operations.mysql.js";
if (!process.env.DB_NAME?.endsWith("_test"))
  throw Error(
    "Test requires DB_NAME ending in _test. Run db:demo on a separate database.",
  );
process.env.NODE_ENV = "test";
process.env.PAYMENT_MODE = "demo";
process.env.SEPAY_WEBHOOK_KEY = "test-webhook-secret";
const { server } = await import("../server.js");
const { default: pool } = await import("../database/mysql.js");
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
async function client(email, password) {
  const r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const csrf = (
    await fetch(base + "/api/csrf", { headers: { cookie } }).then((r) =>
      r.json(),
    )
  ).token;
  return async (path, method = "GET", body) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  };
}
test("real MySQL end-to-end transactions and role isolation", async (t) => {
  try {
    const customer = await client("khach@n01sport.vn", "Khach@123"),
      owner = await client("chusan@n01sport.vn", "ChuSan@123"),
      tech = await client("kythuat@n01sport.vn", "KyThuat@123"),
      reception = await client("letan@n01sport.vn", "LeTan@123"),
      admin = await client("admin@n01sport.vn", "Admin@123");
    const d = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      body = {
        court_id: 1,
        start_at: d + "T12:00:00",
        end_at: d + "T13:00:00",
      };
    let booking;
    await t.test(
      "reject arbitrary slot and atomic concurrent double booking",
      async () => {
        assert.equal(
          (
            await customer("/api/bookings", "POST", {
              ...body,
              start_at: d + "T12:15:00",
            })
          ).status,
          400,
        );
        const results = await Promise.all([
          customer("/api/bookings", "POST", body),
          customer("/api/bookings", "POST", body),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        booking = results.find((r) => r.status === 201).data.booking;
      },
    );
    await t.test(
      "customer cannot edit owner resources and CSRF token is needed",
      async () => {
        assert.equal((await customer("/api/manage/prices")).status, 403);
        const r = await fetch(base + "/api/manage/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        assert.equal(r.status, 401);
      },
    );
    await t.test(
      "paid cancellation retains occupied slot until owner approval",
      async () => {
        assert.equal(
          (await customer("/api/bookings/" + booking.id + "/pay", "POST", {}))
            .status,
          200,
        );
        assert.equal(
          (
            await customer("/api/bookings/" + booking.id + "/cancel", "POST", {
              reason: "Test cancellation",
            })
          ).status,
          200,
        );
        assert.equal(
          (await customer("/api/bookings", "POST", body)).status,
          409,
        );
        const dash = await owner("/api/owner/dashboard");
        const rr = dash.data.refunds.find((r) => r.booking_id === booking.id);
        assert.ok(rr);
        assert.equal(
          (
            await owner("/api/owner/refunds/" + rr.id, "PATCH", {
              status: "refunded",
              transaction_ref: "bad",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await owner("/api/owner/refunds/" + rr.id, "PATCH", {
              status: "rejected",
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "service reservation, payment, rental return and duplicate return protection",
      async () => {
        const [before] = await pool.execute(
          "SELECT stock_quantity FROM services WHERE id=1",
        );
        const order = await customer("/api/orders", "POST", {
          booking_id: booking.id,
          items: [{ service_id: 1, quantity: 2 }],
        });
        assert.equal(order.status, 201, JSON.stringify(order.data));
        const [after] = await pool.execute(
          "SELECT stock_quantity FROM services WHERE id=1",
        );
        assert.equal(after[0].stock_quantity, before[0].stock_quantity - 2);
        assert.equal(
          (
            await customer("/api/orders/" + order.data.id, "PATCH", {
              action: "pay",
              payment_ref: "fake",
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await reception("/api/orders/" + order.data.id, "PATCH", {
              action: "pay",
              payment_ref: "CASH-TEST",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await reception("/api/orders/" + order.data.id, "PATCH", {
              action: "deliver",
            })
          ).status,
          200,
        );
        const list = await reception("/api/orders"),
          item = list.data.items.find((i) => i.order_id === order.data.id);
        assert.equal(
          (
            await reception("/api/orders/" + order.data.id, "PATCH", {
              action: "return",
              lost: { [item.id]: 1 },
              damage_fee: 10000,
              payment_ref: "FEE-TEST",
              condition_in: "Lost one",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await reception("/api/orders/" + order.data.id, "PATCH", {
              action: "return",
            })
          ).status,
          409,
        );
        const [final] = await pool.execute(
          "SELECT stock_quantity FROM services WHERE id=1",
        );
        assert.equal(final[0].stock_quantity, before[0].stock_quantity - 1);
      },
    );
    await t.test(
      "technical staff cannot mutate another venue task",
      async () => {
        const [r] = await pool.execute(
          "INSERT INTO maintenance_requests(court_id,reported_by,title,description) VALUES(4,3,'Outside venue','Test')",
        );
        assert.equal(
          (
            await tech("/api/staff/maintenance/" + r.insertId, "PATCH", {
              status: "assigned",
            })
          ).status,
          403,
        );
      },
    );
    await t.test("point redemption and support persist", async () => {
      const reward = await owner("/api/manage/rewards", "POST", {
        name: "Test reward",
        points_cost: 10,
        discount_value: 10000,
        active: true,
      });
      assert.equal(reward.status, 201, JSON.stringify(reward.data));
      const redeem = await customer(
        "/api/rewards/" + reward.data.id + "/redeem",
        "POST",
        {},
      );
      assert.equal(redeem.status, 201);
      assert.match(redeem.data.code, /^DIEM/);
      const ticket = await customer("/api/support", "POST", {
        venue_id: 1,
        subject: "Test",
        message: "Need support",
      });
      assert.equal(ticket.status, 201);
      assert.equal(
        (
          await owner("/api/support/" + ticket.data.id, "POST", {
            message: "Resolved",
            status: "resolved",
          })
        ).status,
        200,
      );
    });
    await t.test("report SQL and setting APIs work on MySQL 8", async () => {
      const report = await owner("/api/reports?from=" + d + "&to=" + d);
      assert.equal(report.status, 200, JSON.stringify(report.data));
      assert.ok(Array.isArray(report.data.courts));
      assert.equal(
        (
          await admin("/api/manage/settings", "POST", {
            setting_key: "site_name",
            setting_value: "N01 Test",
            description: "",
          })
        ).status,
        201,
      );
    });
    await operationsTests(t, {
      pool,
      base,
      client,
      customer,
      owner,
      reception,
      admin,
      tech,
      d,
    });
  } finally {
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
