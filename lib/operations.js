import { spawn } from "node:child_process";
import {
  mkdirSync,
  createWriteStream,
  createReadStream,
} from "node:fs";
import { resolve, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import pool from "../database/mysql.js";
const dir = resolve(process.env.BACKUP_DIR || "var/backups");
export function backupPath(name) {
  if (basename(name) !== name || !/^n01-\d+-\d+\.sql$/.test(name))
    throw new Error("Tên sao lưu không hợp lệ.");
  return resolve(dir, name);
}
export async function createBackup(id) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = `n01-${id}-${Date.now()}.sql`,
    file = backupPath(name);
  const args = [
    "--host=" + process.env.DB_HOST,
    "--port=" + String(process.env.DB_PORT || 3306),
    "--user=" + process.env.DB_USER,
    "--single-transaction",
    "--skip-lock-tables",
    "--no-tablespaces",
    ...(process.env.MYSQLDUMP_FLAVOR === "mariadb"
      ? []
      : ["--set-gtid-purged=OFF"]),
    process.env.DB_NAME || "n01sport",
  ];
  const child = spawn(process.env.MYSQLDUMP_BIN || "mysqldump", args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let error = "";
  child.stderr.on("data", (b) => {
    error = (error + b.toString()).slice(-1000);
  });
  const done = new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolveDone()
        : reject(new Error(error || "mysqldump thất bại")),
    );
  });
  await Promise.all([
    pipeline(
      child.stdout,
      createWriteStream(file, { mode: 0o600, flags: "wx" }),
    ),
    done,
  ]);
  const digest=createHash("sha256");for await(const chunk of createReadStream(file))digest.update(chunk);const hash=digest.digest("hex");
  await pool.execute(
    "UPDATE backup_jobs SET status='completed',file_name=?,checksum_sha256=?,completed_at=NOW() WHERE id=?",
    [name, hash, id],
  );
}
let busy = false;
export async function workOnce() {
  if (busy) return;
  busy = true;
  try {
    await pool.execute(
      "UPDATE bookings SET status='expired' WHERE status='pending' AND hold_expires_at<=NOW()",
    );
    await pool.execute(
      "UPDATE payments p JOIN bookings b ON b.id=p.booking_id SET p.status='failed' WHERE b.status='expired' AND p.status='pending'",
    );
    await pool.execute(
      "UPDATE coach_schedules cs JOIN bookings b ON b.id=cs.booking_id SET cs.status=CASE WHEN b.status='completed' THEN 'completed' ELSE 'cancelled' END WHERE b.status IN ('completed','cancelled','expired','no_show') AND cs.status='scheduled'",
    );
    await pool.execute(
      "UPDATE booking_series s SET status='confirmed' WHERE s.status='pending' AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.series_id=s.id AND b.status='pending') AND EXISTS(SELECT 1 FROM bookings b WHERE b.series_id=s.id AND b.status='confirmed')",
    );
    await pool.execute("DELETE FROM auth_sessions WHERE expires_at<NOW()");
    await pool.execute(
      "DELETE FROM password_reset_tokens WHERE expires_at<NOW()",
    );
    await pool.execute(
      "DELETE FROM auth_attempts WHERE window_start<DATE_SUB(NOW(),INTERVAL 1 DAY)",
    );
    await pool.execute(
      "DELETE FROM system_errors WHERE created_at<DATE_SUB(NOW(),INTERVAL 90 DAY)",
    );
    // Cancel stale unpaid service reservations and release inventory once.
    const [stale] = await pool.execute(
      "SELECT id FROM service_orders WHERE status='pending' AND created_at<DATE_SUB(NOW(),INTERVAL 30 MINUTE) LIMIT 20",
    );
    for (const row of stale) {
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        const [orders] = await c.execute(
          "SELECT id FROM service_orders WHERE id=? AND status='pending' FOR UPDATE",
          [row.id],
        );
        if (orders.length) {
          const [items] = await c.execute(
            "SELECT * FROM service_order_items WHERE order_id=? ORDER BY service_id",
            [row.id],
          );
          for (const i of items)
            await c.execute(
              "UPDATE services SET stock_quantity=stock_quantity+? WHERE id=?",
              [i.quantity, i.service_id],
            );
          await c.execute(
            "UPDATE service_orders SET status='cancelled' WHERE id=?",
            [row.id],
          );
          await c.execute(
            "UPDATE service_order_items SET status='cancelled' WHERE order_id=?",
            [row.id],
          );
        }
        await c.commit();
      } catch (e) {
        await c.rollback();
        throw e;
      } finally {
        c.release();
      }
    }
    const [jobs] = await pool.execute(
      "SELECT id FROM backup_jobs WHERE status='queued' ORDER BY id LIMIT 1",
    );
    for (const j of jobs) {
      const [r] = await pool.execute(
        "UPDATE backup_jobs SET status='running' WHERE id=? AND status='queued'",
        [j.id],
      );
      if (!r.affectedRows) continue;
      try {
        await createBackup(j.id);
      } catch (e) {
        await pool.execute(
          "UPDATE backup_jobs SET status='failed',error_message=?,completed_at=NOW() WHERE id=?",
          [String(e.message).slice(0, 1000), j.id],
        );
      }
    }
    if (process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
        connectionTimeout: 10000,
        socketTimeout: 15000,
      });
      const [emails] = await pool.execute(
        "SELECT * FROM email_outbox WHERE status IN ('queued','failed') AND attempts<5 ORDER BY id LIMIT 5",
      );
      for (const e of emails) {
        const [r] = await pool.execute(
          "UPDATE email_outbox SET status='sending',attempts=attempts+1 WHERE id=? AND status IN ('queued','failed')",
          [e.id],
        );
        if (!r.affectedRows) continue;
        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: e.recipient,
            subject: e.subject,
            text: e.body,
          });
          await pool.execute(
            "UPDATE email_outbox SET status='sent',sent_at=NOW(),body='[Đã gửi]' WHERE id=?",
            [e.id],
          );
        } catch (err) {
          await pool.execute(
            "UPDATE email_outbox SET status='failed',last_error=? WHERE id=?",
            [String(err.code || "SMTP_ERROR"), e.id],
          );
        }
      }
    }
  } finally {
    busy = false;
  }
}
