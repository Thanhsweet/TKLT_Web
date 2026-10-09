import assert from "node:assert/strict";
import { workOnce } from "../lib/operations.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
export async function operationsTests(
  t,
  { pool, base, client, customer, owner, reception, admin, tech, d },
) {
  const coach = await client("hlv@n01sport.vn", "HLV@12345");
  const cleaner = await client("vesinh@n01sport.vn", "VeSinh@123");
  const slot = (court = 2, hour = "10") => ({
    court_id: court,
    start_at: `${d}T${hour}:00:00`,
    end_at: `${d}T${Number(hour) + 1}:00:00`,
  });
  await t.test(
    "invalid date and opening hours cannot create bookings",
    async () => {
      assert.equal(
        (await customer("/api/courts/1/slots?date=2026-02-31")).status,
        400,
      );
      assert.equal(
        (await customer("/api/bookings", "POST", slot(1, "02"))).status,
        400,
      );
      assert.equal((await customer("/api/manage/users")).status, 403);
    },
  );
  await t.test(
    "coach recurring schedule is atomic and can be rescheduled",
    async () => {
      const body = {
        ...slot(),
        weeks: 2,
        class_name: "Lớp kiểm thử",
        participant_limit: 8,
      };
      const series = await coach("/api/coach/series", "POST", body);
      assert.equal(series.status, 201, JSON.stringify(series.data));
      assert.equal(series.data.bookings.length, 2);
      const count = (
        await pool.query("SELECT COUNT(*) AS n FROM bookings")
      )[0][0].n;
      assert.equal(
        (await coach("/api/coach/series", "POST", body)).status,
        409,
      );
      assert.equal(
        (await pool.query("SELECT COUNT(*) AS n FROM bookings"))[0][0].n,
        count,
      );
      const list = await coach("/api/coach/schedules");
      const row = list.data.schedules.find(
        (s) => s.booking_id === series.data.bookings[0].id,
      );
      assert.ok(row);
      assert.equal(
        (
          await coach("/api/coach/schedules/" + row.id, "PATCH", {
            ...slot(2, "11"),
            class_name: "Đổi giờ",
            participant_limit: 8,
          })
        ).status,
        200,
      );
      assert.equal(
        (await customer("/api/coach/schedules/" + row.id, "PATCH", {})).status,
        403,
      );
    },
  );
  let paymentBooking;
  await t.test(
    "real MySQL webhook matches QR amount, prevents duplicate and rejects bad secret",
    async () => {
      assert.equal(
        (
          await owner("/api/manage/bank", "POST", {
            venue_id: 1,
            bank_code: "VCB",
            account_number: "123456789",
            account_name: "TEST ONLY",
          })
        ).status,
        409,
      ); // coach holds exist
      await pool.execute(
        "UPDATE bookings SET status='expired',hold_expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE status='pending'",
      );
      assert.equal(
        (
          await owner("/api/manage/bank", "POST", {
            venue_id: 1,
            bank_code: "VCB",
            account_number: "123456789",
            account_name: "TEST ONLY",
          })
        ).status,
        201,
      );
      const previous = process.env.PAYMENT_MODE;
      process.env.PAYMENT_MODE = "bank_transfer";
      try {
        const r = await customer("/api/bookings", "POST", slot(3, "14"));
        assert.equal(r.status, 201, JSON.stringify(r.data));
        paymentBooking = r.data.booking;
        assert.equal(
          (await customer(`/api/bookings/${paymentBooking.id}/pay`, "POST", {}))
            .status,
          403,
        );
        assert.equal(
          (
            await owner("/api/manage/bank/1", "PATCH", {
              account_number: "987654321",
            })
          ).status,
          409,
        );
        const info = await customer(
          `/api/bookings/${paymentBooking.id}/payment`,
        );
        assert.equal(info.status, 200, JSON.stringify(info.data));
        const payload = {
          id: 700001,
          transferType: "in",
          transferAmount: paymentBooking.total_amount,
          accountNumber: "123456789",
          content: paymentBooking.booking_code.replaceAll("-", ""),
        };
        async function event(data, key = "test-webhook-secret") {
          const r = await fetch(base + "/api/webhooks/sepay", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              authorization: "Apikey " + key,
            },
            body: JSON.stringify(data),
          });
          return { status: r.status, data: await r.json() };
        }
        assert.equal((await event(payload, "wrong-secret")).status, 401);
        assert.equal(
          (await event({ ...payload, id: 700002, transferAmount: 1 })).status,
          200,
        );
        assert.equal(
          (
            await pool.query("SELECT status FROM bookings WHERE id=?", [
              paymentBooking.id,
            ])
          )[0][0].status,
          "pending",
        );
        assert.equal((await event(payload)).status, 200);
        assert.equal((await event(payload)).status, 200);
        assert.equal(
          (
            await pool.query("SELECT status FROM bookings WHERE id=?", [
              paymentBooking.id,
            ])
          )[0][0].status,
          "confirmed",
        );
        assert.equal(
          (
            await pool.query(
              "SELECT COUNT(*) AS n FROM payment_events WHERE event_id='700001'",
            )
          )[0][0].n,
          1,
        );
      } finally {
        process.env.PAYMENT_MODE = previous;
      }
    },
  );
  await t.test(
    "refund approval releases schedule and payment evidence is persisted in audit",
    async () => {
      assert.equal(
        (
          await customer(`/api/bookings/${paymentBooking.id}/cancel`, "POST", {
            reason: "Test refund",
          })
        ).status,
        200,
      );
      const refund = (
        await pool.query("SELECT id FROM refund_requests WHERE booking_id=?", [
          paymentBooking.id,
        ])
      )[0][0];
      assert.equal(
        (
          await owner("/api/owner/refunds/" + refund.id, "PATCH", {
            status: "approved",
            approved_amount: 100000,
          })
        ).status,
        200,
      );
      assert.equal(
        (await customer("/api/bookings", "POST", slot(3, "14"))).status,
        201,
      );
      assert.equal(
        (
          await owner("/api/owner/refunds/" + refund.id, "PATCH", {
            status: "refunded",
            transaction_ref: "TEST-REFUND-001",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await owner("/api/owner/refunds/" + refund.id, "PATCH", {
            status: "rejected",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await pool.query("SELECT status FROM payments WHERE booking_id=?", [
            paymentBooking.id,
          ])
        )[0][0].status,
        "refunded",
      );
      const audit = (
        await pool.query(
          "SELECT new_values FROM audit_logs WHERE action='refund_refunded' ORDER BY id DESC LIMIT 1",
        )
      )[0][0];
      assert.match(JSON.stringify(audit), /TEST-REFUND-001/);
    },
  );
  await t.test(
    "reception completion, points, cleaning workflow and review persist once",
    async () => {
      const r = await customer("/api/bookings", "POST", slot(1, "15"));
      assert.equal(r.status, 201);
      const id = r.data.booking.id;
      await customer(`/api/bookings/${id}/pay`, "POST", {});
      await pool.query(
        "UPDATE bookings SET start_at=DATE_SUB(NOW(),INTERVAL 10 MINUTE),end_at=DATE_ADD(NOW(),INTERVAL 50 MINUTE) WHERE id=?",
        [id],
      );
      assert.equal(
        (
          await reception(`/api/staff/bookings/${id}/status`, "PATCH", {
            status: "checked_in",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await reception(`/api/staff/bookings/${id}/status`, "PATCH", {
            status: "completed",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await reception(`/api/staff/bookings/${id}/status`, "PATCH", {
            status: "completed",
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*) AS n FROM loyalty_transactions WHERE booking_id=?",
            [id],
          )
        )[0][0].n,
        1,
      );
      const task = (
        await pool.query("SELECT id FROM cleaning_tasks WHERE booking_id=?", [
          id,
        ])
      )[0][0];
      for (const status of ["assigned", "in_progress", "completed"])
        assert.equal(
          (await cleaner("/api/staff/cleaning/" + task.id, "PATCH", { status }))
            .status,
          200,
        );
      assert.equal(
        (
          await cleaner("/api/staff/cleaning/" + task.id, "PATCH", {
            status: "completed",
          })
        ).status,
        409,
      );
      const review = await customer(`/api/bookings/${id}/review`, "POST", {
        rating: 5,
        comment: "Đã sử dụng sân",
      });
      assert.equal(review.status, 200, JSON.stringify(review.data));
      assert.equal(
        (
          await customer(`/api/bookings/${id}/review`, "POST", {
            rating: 4,
            comment: "Cập nhật đánh giá",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*) AS n FROM reviews WHERE booking_id=?",
            [id],
          )
        )[0][0].n,
        1,
      );
      assert.equal((await customer(`/api/bookings/${id}/invoice`)).status, 200);
    },
  );
  await t.test(
    "unpaid service expiration returns stock exactly once and type cannot change after transactions",
    async () => {
      const booking = (
        await pool.query(
          "SELECT id FROM bookings WHERE user_id=1 AND status='confirmed' ORDER BY id LIMIT 1",
        )
      )[0][0];
      const before = (
        await pool.query("SELECT stock_quantity FROM services WHERE id=2")
      )[0][0].stock_quantity;
      const order = await customer("/api/orders", "POST", {
        booking_id: booking.id,
        items: [{ service_id: 2, quantity: 3 }],
      });
      assert.equal(order.status, 201);
      await pool.query(
        "UPDATE service_orders SET created_at=DATE_SUB(NOW(),INTERVAL 31 MINUTE) WHERE id=?",
        [order.data.id],
      );
      await workOnce();
      await workOnce();
      assert.equal(
        (
          await pool.query("SELECT stock_quantity FROM services WHERE id=2")
        )[0][0].stock_quantity,
        before,
      );
      assert.equal(
        (await owner("/api/manage/services/2", "PATCH", { type: "rental" }))
          .status,
        409,
      );
    },
  );
  await t.test(
    "inactive assignment removes assigned tasks from staff dashboard and write access",
    async () => {
      const [r] = await pool.execute(
        "INSERT INTO maintenance_requests(court_id,reported_by,assigned_to,title,description) VALUES(1,3,5,'Task for stopped staff','Test')",
      );
      await pool.query(
        "UPDATE staff_assignments SET active=FALSE WHERE staff_id=5",
      );
      assert.equal((await tech("/api/staff/dashboard")).data.work.length, 0);
      assert.equal(
        (
          await tech("/api/staff/maintenance/" + r.insertId, "PATCH", {
            status: "assigned",
          })
        ).status,
        403,
      );
      await pool.query(
        "UPDATE staff_assignments SET active=TRUE WHERE staff_id=5",
      );
    },
  );
  await t.test(
    "reports preserve gross receipts and refunds and exclude overlapping maintenance once",
    async () => {
      for (const [start, end] of [
        ["16:00:00", "17:00:00"],
        ["16:30:00", "17:30:00"],
      ]) {
        const block = await owner("/api/manage/blocks", "POST", {
          court_id: 1,
          start_at: d + " " + start,
          end_at: d + " " + end,
          reason: "Maintenance test",
          active: true,
        });
        assert.equal(block.status, 201, JSON.stringify(block.data));
      }
      const report = await owner("/api/reports?from=" + d + "&to=" + d);
      assert.equal(report.status, 200, JSON.stringify(report.data));
      assert.equal(
        report.data.courts.find((c) => c.id === 1).blocked_minutes,
        90,
      );
      const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const cash = await owner("/api/reports?from=" + day + "&to=" + day);
      assert.equal(cash.status, 200, JSON.stringify(cash.data));
      assert.equal(
        cash.data.refunds.reduce((n, r) => n + r.amount, 0),
        100000,
      );
      assert.ok(
        cash.data.daily.reduce((n, r) => n + r.amount, 0) >=
          paymentBooking.total_amount,
      );
    },
  );
  if (process.env.MYSQLDUMP_BIN && process.env.MYSQL_BIN)
    await t.test(
      "actual SQL backup and restore into separate database retain rows and checksum",
      async () => {
        const r = await admin("/api/admin/backups", "POST", {});
        assert.equal(r.status, 202);
        await workOnce();
        const job = (
          await pool.query("SELECT * FROM backup_jobs WHERE id=?", [r.data.id])
        )[0][0];
        assert.equal(job.status, "completed", job.error_message);
        const file =
          (process.env.BACKUP_DIR || "var/backups") + "/" + job.file_name;
        assert.equal(
          createHash("sha256").update(readFileSync(file)).digest("hex"),
          job.checksum_sha256,
        );
        const backup = await fetch(
          base + `/api/admin/backups/${job.id}/download`,
        );
        assert.equal(backup.status, 401);
        const recovery = process.env.DB_NAME + "_recovery";
        await pool.query("DROP DATABASE IF EXISTS `" + recovery + "`");
        execFileSync(
          process.execPath,
          ["scripts/restore.js", file, recovery, "--confirm"],
          { env: process.env, stdio: "pipe" },
        );
        const [actual] = await pool.query(
          "SELECT COUNT(*) AS n FROM `" + recovery + "`.bookings",
        );
        const [expected] = await pool.query(
          "SELECT COUNT(*) AS n FROM bookings",
        );
        assert.equal(actual[0].n, expected[0].n);
      },
    );
  await t.test(
    "password reset token is single use and invalidates previous sessions",
    async () => {
      const previous = process.env.SMTP_HOST;
      process.env.SMTP_HOST = "test.invalid";
      try {
        const r = await customer("/api/auth/forgot", "POST", {
          email: "khach@n01sport.vn",
        });
        assert.equal(r.status, 200);
        const email = (
          await pool.query(
            "SELECT body FROM email_outbox WHERE subject='Khôi phục mật khẩu N01SPORT' ORDER BY id DESC LIMIT 1",
          )
        )[0][0];
        const token = email.body.match(/#reset=([a-f0-9]+)/)[1];
        assert.equal(
          (
            await customer("/api/auth/reset", "POST", {
              token,
              password: "NewTestPassword@123",
            })
          ).status,
          200,
        );
        assert.equal((await customer("/api/bookings")).status, 401);
        assert.equal(
          (
            await customer("/api/auth/reset", "POST", {
              token,
              password: "NewTestPassword@123",
            })
          ).status,
          409,
        );
        const renewed = await client(
          "khach@n01sport.vn",
          "NewTestPassword@123",
        );
        assert.equal(
          (
            await renewed("/api/account/password", "POST", {
              current_password: "NewTestPassword@123",
              password: "Khach@123",
            })
          ).status,
          400,
        ); // all new passwords >=10 chars
      } finally {
        if (previous === undefined) delete process.env.SMTP_HOST;
        else process.env.SMTP_HOST = previous;
      }
      // Restore demo credential for subsequent browser smoke, via trusted isolated-test SQL.
      const { hashPassword } = await import("../lib/security.js");
      await pool.query("UPDATE users SET password_hash=? WHERE id=1", [
        hashPassword("Khach@123"),
      ]);
    },
  );
}
