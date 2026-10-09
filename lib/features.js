import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  tokenHash,
  bookingCode,
} from "./security.js";
import { csrfFor } from "./http-security.js";
import {
  fail,
  text,
  integer,
  choice,
  dateTime,
  validateSlot,
} from "./validation.js";
import { createBookings } from "./bookings.js";
import { resources } from "./resources.js";
import { bankInfo, handleBankEvent } from "./payments.js";
import { blockedMinutes } from "./reporting.js";
import { backupPath } from "./operations.js";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";

export function featureHandler(ctx) {
  const {
    pool,
    one,
    all,
    json,
    readBody,
    currentUser,
    requireUser,
    parseCookies,
    notify,
    audit,
    bookingDetail,
  } = ctx;
  async function tx(fn) {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const r = await fn(c);
      await c.commit();
      return r;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async function accessVenue(user, id, c = pool) {
    const v = await one(
      `SELECT v.* FROM venues v WHERE v.id=? AND (v.owner_id=? OR ?='admin' OR (? IN ('receptionist','technician','cleaner') AND EXISTS(SELECT 1 FROM staff_assignments sa WHERE sa.venue_id=v.id AND sa.staff_id=? AND sa.position=? AND sa.active=TRUE)))`,
      [id, user.id, user.role, user.role, user.id, user.role],
      c,
    );
    if (!v) fail("Cơ sở không thuộc quyền quản lý.", 403);
    return v;
  }
  async function accessibleBooking(user, id, c = pool, lock = false) {
    const b = await one(
      `SELECT b.*,ct.venue_id,ct.name AS court_name,v.name AS venue_name,v.address,v.owner_id,COALESCE(b.guest_name,u.full_name) AS full_name,p.status AS payment_status,p.transaction_ref,p.provider,p.paid_at
  FROM bookings b JOIN courts ct ON ct.id=b.court_id JOIN venues v ON v.id=ct.venue_id LEFT JOIN users u ON u.id=b.user_id LEFT JOIN payments p ON p.booking_id=b.id WHERE b.id=? ${lock ? "FOR UPDATE" : ""}`,
      [id],
      c,
    );
    if (!b) fail("Không tìm thấy booking.", 404);
    if (b.user_id !== user.id) await accessVenue(user, b.venue_id, c);
    return b;
  }
  async function parseField(type, val, user) {
    if (Array.isArray(type))
      return choice(
        typeof type[0] === "number" ? Number(val) : val,
        type,
        "Giá trị",
      );
    if (type === "bool") return val === true || val === 1 || val === "1";
    if (type === "money" || type === "positive")
      return integer(val, "Số lượng / tiền", type === "positive" ? 1 : 0);
    if (type === "optionalMoney" || type === "optionalPositive")
      return val === "" || val === null
        ? null
        : integer(val, "Số", type === "optionalPositive" ? 1 : 0);
    if (type === "datetime") return dateTime(val);
    if (type === "time") {
      if (
        !/^\d\d:\d\d(:\d\d)?$/.test(val) ||
        Number(val.slice(0, 2)) > 23 ||
        Number(val.slice(3, 5)) > 59
      )
        fail("Giờ không hợp lệ.");
      return val.length === 5 ? val + ":00" : val;
    }
    if (type === "optionalDate") {
      if (!val) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) fail("Ngày không hợp lệ.");
      dateTime(val + " 00:00:00");
      return val;
    }
    if (type === "day")
      return val === "" || val === null
        ? null
        : integer(val, "Ngày tuần", 0, 6);
    if (type === "latitude" || type === "longitude") {
      const n = Number(val);
      if (!Number.isFinite(n) || Math.abs(n) > (type === "latitude" ? 90 : 180))
        fail("Tọa độ không hợp lệ.");
      return n;
    }
    if (type === "venue") {
      const n = integer(val, "Cơ sở", 1);
      await accessVenue(user, n);
      return n;
    }
    if (type === "court") {
      const n = integer(val, "Sân", 1);
      const ct = await one("SELECT venue_id FROM courts WHERE id=?", [n]);
      if (!ct) fail("Không tìm thấy sân.", 404);
      await accessVenue(user, ct.venue_id);
      return n;
    }
    if (type === "url") {
      const s = text(val, "URL", 500);
      if (!s.startsWith("/uploads/") && !/^https:\/\//.test(s))
        fail("Ảnh cần URL HTTPS hoặc /uploads/.");
      return s;
    }
    if (type === "code") {
      const s = text(val, "Mã", 50).toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(s)) fail("Mã chỉ gồm chữ, số, gạch ngang.");
      return s;
    }
    if (type === "account") {
      const s = text(val, "Tài khoản", 40);
      if (!/^\d+$/.test(s)) fail("Số tài khoản chỉ gồm chữ số.");
      return s;
    }
    return text(
      val,
      "Thông tin",
      type === "long" ? 10000 : 255,
      type === "optionalText" ? 0 : 1,
    );
  }
  return async (req, res, url) => {
    const p = url.pathname,
      m = req.method;
    if (p === "/api/csrf" && m === "GET")
      return json(res, 200, { token: csrfFor(parseCookies(req).n01_session) });
    if (p === "/api/config" && m === "GET")
      return json(res, 200, {
        demo:
          process.env.PAYMENT_MODE === "demo" &&
          process.env.NODE_ENV !== "production",
        settings: await all(
          "SELECT setting_key,setting_value FROM site_settings WHERE setting_key IN ('site_name','support_email','support_phone','company_address','terms','privacy')",
        ),
      });
    let detail = p.match(/^\/api\/courts\/(\d+)$/);
    if (detail && m === "GET") {
      const court = await one(
        "SELECT ct.*,v.name AS venue_name,v.description,v.address,v.district,v.city,v.open_time,v.close_time,v.latitude,v.longitude,v.rating,s.name AS sport_name FROM courts ct JOIN venues v ON v.id=ct.venue_id JOIN sports s ON s.id=ct.sport_id WHERE ct.id=? AND ct.status='active' AND v.status='active'",
        [Number(detail[1])],
      );
      if (!court) fail("Không tìm thấy sân hoạt động.", 404);
      return json(res, 200, {
        court,
        images: await all(
          "SELECT * FROM venue_images WHERE venue_id=? ORDER BY sort_order,id",
          [court.venue_id],
        ),
        reviews: await all(
          "SELECT r.rating,r.comment,r.created_at,u.full_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.venue_id=? AND r.status='visible' ORDER BY r.id DESC LIMIT 30",
          [court.venue_id],
        ),
      });
    }
    if (p === "/api/uploads" && m === "POST") {
      const u = await requireUser(req, res, ["owner"]);
      if (!u) return true;
      const b = await readBody(req);
      const data = String(b.data || "").match(
        /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!data) fail("Chỉ nhận ảnh PNG/JPEG.");
      const bytes = Buffer.from(data[2], "base64");
      if (bytes.length > 600000 || bytes.length < 12)
        fail("Ảnh tối đa 600 KB.");
      if (
        (data[1] === "png" &&
          bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") ||
        (data[1] === "jpeg" &&
          bytes.subarray(0, 3).toString("hex") !== "ffd8ff")
      )
        fail("Nội dung ảnh không hợp lệ.");
      const dir = resolve("public/uploads");
      mkdirSync(dir, { recursive: true });
      const filename =
        createSessionToken() + "." + (data[1] === "jpeg" ? "jpg" : "png");
      writeFileSync(resolve(dir, filename), bytes, { flag: "wx", mode: 0o644 });
      return json(res, 201, { url: "/uploads/" + filename });
    }
    if (p === "/api/webhooks/sepay" && m === "POST")
      return json(
        res,
        200,
        await handleBankEvent(req, await readBody(req), ctx),
      );
    if (p === "/api/auth/forgot" && m === "POST") {
      const b = await readBody(req),
        email = text(b.email, "Email", 255).toLowerCase();
      if (!process.env.SMTP_HOST)
        fail(
          "Khôi phục qua email chưa được cấu hình. Liên hệ quản trị viên.",
          503,
        );
      const u = await one(
        "SELECT id FROM users WHERE email=? AND status='active'",
        [email],
      );
      if (u)
        await tx(async (c) => {
          const token = createSessionToken();
          await c.execute("DELETE FROM password_reset_tokens WHERE user_id=?", [
            u.id,
          ]);
          await c.execute(
            "INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))",
            [tokenHash(token), u.id],
          );
          await c.execute(
            "INSERT INTO email_outbox(recipient,subject,body) VALUES(?,?,?)",
            [
              email,
              "Khôi phục mật khẩu N01SPORT",
              `Mở liên kết trong 30 phút: ${process.env.PUBLIC_URL || "http://localhost:3000"}/account.html#reset=${token}\nNếu không yêu cầu, hãy bỏ qua.`,
            ],
          );
        });
      return json(res, 200, {
        message: "Nếu email đã đăng ký, hướng dẫn khôi phục sẽ được gửi.",
      });
    }
    if (p === "/api/auth/reset" && m === "POST") {
      const b = await readBody(req),
        password = text(b.password, "Mật khẩu", 128, 10);
      await tx(async (c) => {
        const r = await one(
          "SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW() FOR UPDATE",
          [tokenHash(text(b.token, "Token", 100))],
          c,
        );
        if (!r) fail("Liên kết hết hạn hoặc đã sử dụng.", 409);
        await c.execute("UPDATE users SET password_hash=? WHERE id=?", [
          hashPassword(password),
          r.user_id,
        ]);
        await c.execute(
          "UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=?",
          [r.user_id],
        );
        await c.execute("DELETE FROM auth_sessions WHERE user_id=?", [
          r.user_id,
        ]);
        await audit(
          r.user_id,
          "reset_password",
          "user",
          r.user_id,
          null,
          null,
          req,
          c,
        );
      });
      return json(res, 200, { ok: true });
    }
    if (p === "/api/account/password" && m === "POST") {
      const u = await requireUser(req, res);
      if (!u) return true;
      const b = await readBody(req),
        password = text(b.password, "Mật khẩu mới", 128, 10);
      await tx(async (c) => {
        const row = await one(
          "SELECT password_hash FROM users WHERE id=? FOR UPDATE",
          [u.id],
          c,
        );
        if (
          !verifyPassword(
            text(b.current_password, "Mật khẩu hiện tại", 128),
            row.password_hash,
          )
        )
          fail("Mật khẩu hiện tại không đúng.", 403);
        await c.execute("UPDATE users SET password_hash=? WHERE id=?", [
          hashPassword(password),
          u.id,
        ]);
        await c.execute("DELETE FROM auth_sessions WHERE user_id=?", [u.id]);
        await audit(u.id, "change_password", "user", u.id, null, null, req, c);
      });
      return json(res, 200, { ok: true });
    }
    if ((p === "/api/bookings" || p === "/api/coach/series") && m === "POST") {
      const u = await requireUser(
        req,
        res,
        p.includes("/coach/") ? ["coach"] : ["customer", "coach"],
      );
      if (!u) return true;
      const created = await createBookings(
        u,
        await readBody(req),
        req,
        ctx,
        p.includes("/coach/"),
      );
      return json(res, 201, {
        bookings: created,
        booking: await bookingDetail(created[0].id),
      });
    }
    let match = p.match(/^\/api\/bookings\/(\d+)\/(payment|invoice)$/);
    if (match && m === "GET") {
      const u = await requireUser(req, res);
      if (!u) return true;
      const b = await accessibleBooking(u, Number(match[1]));
      if (match[2] === "invoice")
        return json(res, 200, {
          booking: b,
          orders: await all("SELECT * FROM service_orders WHERE booking_id=?", [
            b.id,
          ]),
          items: await all(
            "SELECT oi.*,s.name,s.type FROM service_order_items oi JOIN service_orders o ON o.id=oi.order_id JOIN services s ON s.id=oi.service_id WHERE o.booking_id=?",
            [b.id],
          ),
        });
      if (b.provider === "demo")
        return json(res, 200, { booking: b, demo: true });
      return json(res, 200, {
        booking: b,
        demo: false,
        bank: await bankInfo(b, one),
      });
    }
    if (p === "/api/account/loyalty" && m === "GET") {
      const u = await requireUser(req, res);
      if (!u) return true;
      return json(res, 200, {
        points: u.loyalty_points,
        history: await all(
          "SELECT * FROM loyalty_transactions WHERE user_id=? ORDER BY id DESC LIMIT 200",
          [u.id],
        ),
        rewards: await all(
          "SELECT r.*,u.full_name AS owner_name FROM rewards r JOIN users u ON u.id=r.owner_id WHERE r.active=TRUE",
        ),
        coupons: await all(
          "SELECT p.* FROM reward_redemptions rr JOIN promotions p ON p.id=rr.promotion_id WHERE rr.user_id=?",
          [u.id],
        ),
      });
    }
    match = p.match(/^\/api\/rewards\/(\d+)\/redeem$/);
    if (match && m === "POST") {
      const u = await requireUser(req, res, ["customer", "coach"]);
      if (!u) return true;
      const code = await tx(async (c) => {
        const r = await one(
          "SELECT * FROM rewards WHERE id=? AND active=TRUE FOR UPDATE",
          [Number(match[1])],
          c,
        );
        if (!r) fail("Ưu đãi không tồn tại.", 404);
        const user = await one(
          "SELECT loyalty_points FROM users WHERE id=? FOR UPDATE",
          [u.id],
          c,
        );
        if (user.loyalty_points < r.points_cost) fail("Chưa đủ điểm.", 409);
        const code = "DIEM" + createSessionToken().slice(0, 12).toUpperCase();
        const [promo] = await c.execute(
          "INSERT INTO promotions(owner_id,code,name,discount_type,discount_value,starts_at,ends_at,usage_limit,per_user_limit) VALUES(?,?,?,'fixed',?,NOW(),DATE_ADD(NOW(),INTERVAL 30 DAY),1,1)",
          [r.owner_id, code, r.name, r.discount_value],
        );
        await c.execute(
          "INSERT INTO reward_redemptions(user_id,reward_id,promotion_id) VALUES(?,?,?)",
          [u.id, r.id, promo.insertId],
        );
        await c.execute(
          "UPDATE users SET loyalty_points=loyalty_points-? WHERE id=?",
          [r.points_cost, u.id],
        );
        await c.execute(
          "INSERT INTO loyalty_transactions(user_id,points,reason) VALUES(?, ?,?)",
          [u.id, -r.points_cost, "Đổi ưu đãi " + code],
        );
        await audit(
          u.id,
          "redeem_reward",
          "reward",
          r.id,
          null,
          { code },
          req,
          c,
        );
        return code;
      });
      return json(res, 201, { code });
    }
    if (p === "/api/notifications/read" && m === "POST") {
      const u = await requireUser(req, res);
      if (!u) return true;
      await pool.execute(
        "UPDATE notifications SET read_at=NOW() WHERE user_id=? AND read_at IS NULL",
        [u.id],
      );
      return json(res, 200, { ok: true });
    }
    if (p === "/api/portal/options" && m === "GET") {
      const u = await requireUser(req, res);
      if (!u) return true;
      const venues = await all(
        `SELECT v.* FROM venues v WHERE v.owner_id=? OR ?='admin' OR EXISTS(SELECT 1 FROM staff_assignments sa WHERE sa.venue_id=v.id AND sa.staff_id=? AND sa.active=TRUE)`,
        [u.id, u.role, u.id],
      );
      const courts = await all(
        "SELECT id,name,venue_id FROM courts WHERE venue_id IN (SELECT v.id FROM venues v WHERE v.owner_id=? OR ?='admin' OR EXISTS(SELECT 1 FROM staff_assignments sa WHERE sa.venue_id=v.id AND sa.staff_id=? AND sa.active=TRUE))",
        [u.id, u.role, u.id],
      );
      return json(res, 200, {
        venues,
        courts,
        sports: await all("SELECT * FROM sports"),
        publicVenues: await all(
          "SELECT id,name FROM venues WHERE status='active'",
        ),
      });
    }
    if (p === "/api/manage/bookings" && m === "GET") {
      const u = await requireUser(req, res, ["owner", "admin", "receptionist"]);
      if (!u) return true;
      const date =
        url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      dateTime(date + " 00:00:00");
      const query = String(url.searchParams.get("q") || "").slice(0, 100);
      return json(res, 200, {
        bookings: await all(
          `SELECT b.*,ct.name AS court_name,COALESCE(b.guest_name,u.full_name) AS full_name,COALESCE(b.guest_phone,u.phone) AS phone,p.status AS payment_status FROM bookings b JOIN courts ct ON ct.id=b.court_id JOIN venues v ON v.id=ct.venue_id LEFT JOIN users u ON u.id=b.user_id LEFT JOIN payments p ON p.booking_id=b.id WHERE DATE(b.start_at)=? AND (b.booking_code LIKE ? OR COALESCE(b.guest_name,u.full_name) LIKE ?) AND (v.owner_id=? OR ?='admin' OR (?='receptionist' AND EXISTS(SELECT 1 FROM staff_assignments sa WHERE sa.staff_id=? AND sa.venue_id=v.id AND sa.active=TRUE))) ORDER BY b.start_at`,
          [
            date,
            "%" + query + "%",
            "%" + query + "%",
            u.id,
            u.role,
            u.role,
            u.id,
          ],
        ),
      });
    }
    match = p.match(/^\/api\/owner\/staff\/(\d+)$/);
    if (match && m === "PATCH") {
      const u = await requireUser(req, res, ["owner"]);
      if (!u) return true;
      const b = await readBody(req);
      await tx(async (c) => {
        const row = await one(
          "SELECT sa.*,v.owner_id FROM staff_assignments sa JOIN venues v ON v.id=sa.venue_id WHERE sa.staff_id=? AND v.owner_id=? AND sa.id=? FOR UPDATE",
          [Number(match[1]), u.id, integer(b.assignment_id, "Phân công", 1)],
          c,
        );
        if (!row) fail("Nhân viên không thuộc quản lý.", 404);
        const name = text(b.full_name, "Họ tên", 150),
          position = choice(
            b.position,
            ["receptionist", "technician", "cleaner"],
            "Vị trí",
          ),
          active = b.active === true;
        if (dateTime(b.shift_start) >= dateTime(b.shift_end))
          fail("Ca không hợp lệ.");
        await c.execute(
          "UPDATE users SET full_name=?,phone=?,role=? WHERE id=?",
          [
            name,
            String(b.phone || "").slice(0, 20) || null,
            position,
            row.staff_id,
          ],
        );
        await c.execute(
          "UPDATE staff_assignments SET position=?,shift_start=?,shift_end=?,active=? WHERE staff_id=? AND id=?",
          [
            position,
            dateTime(b.shift_start),
            dateTime(b.shift_end),
            active,
            row.staff_id,
            row.id,
          ],
        );
        await c.execute("DELETE FROM auth_sessions WHERE user_id=?", [
          row.staff_id,
        ]);
        await audit(
          u.id,
          "update_staff",
          "user",
          row.staff_id,
          null,
          { active, position },
          req,
          c,
        );
      });
      return json(res, 200, { ok: true });
    }
    match = p.match(/^\/api\/manage\/([a-z]+)(?:\/([^/]+))?$/);
    if (match && resources[match[1]]) {
      const r = resources[match[1]],
        u = await requireUser(req, res, r.roles);
      if (!u) return true;
      const scopeId = u.role === "admin" ? 1 : u.id,
        id = match[2] ? decodeURIComponent(match[2]) : null,
        idCol = r.id || "id";
      if (m === "GET")
        return json(res, 200, {
          rows: await all(
            `SELECT ${r.select || "t.*"} FROM ${r.table} t WHERE ${r.scope} ORDER BY t.${idCol} DESC LIMIT 500`,
            [scopeId],
          ),
        });
      if (!["POST", "PATCH"].includes(m)) return false;
      if (m === "POST" && !r.create)
        fail("Tạo mới qua màn hình chuyên biệt.", 405);
      const b = await readBody(req),
        values = {};
      for (const [key, type] of Object.entries(r.fields))
        if (b[key] !== undefined)
          values[key] = await parseField(type, b[key], u);
      if (!Object.keys(values).length) fail("Không có thông tin cập nhật.");
      if (r.table === "site_settings" && values.setting_value !== undefined) {
        values.setting_value = JSON.stringify(values.setting_value);
        values.updated_by = u.id;
      }
      if (m === "POST") {
        for (const key of Object.keys(r.fields))
          if (
            values[key] === undefined &&
            ![
              "active",
              "effective_from",
              "effective_to",
              "day_of_week",
              "description",
              "sort_order",
            ].includes(key)
          )
            fail("Thiếu " + key);
        if (["rewards", "venues"].includes(r.table)) values.owner_id = u.id;
        if (r.table === "maintenance_blocks") values.created_by = u.id;
      }
      const old = id
        ? await one(
            `SELECT t.* FROM ${r.table} t WHERE t.${idCol}=? AND ${r.scope}`,
            [id, scopeId],
          )
        : null;
      if (m === "PATCH" && !old)
        fail("Không tìm thấy dữ liệu thuộc quyền quản lý.", 404);
      if (
        m === "PATCH" &&
        values[idCol] !== undefined &&
        String(values[idCol]) !== String(id)
      )
        fail("Không thể thay đổi khóa của dữ liệu đã tạo.");
      const merged = { ...old, ...values };
      for (const [a, b] of [
        ["open_time", "close_time"],
        ["start_time", "end_time"],
        ["starts_at", "ends_at"],
        ["start_at", "end_at"],
        ["shift_start", "shift_end"],
        ["effective_from", "effective_to"],
      ])
        if (
          merged[a] &&
          merged[b] &&
          (a === "effective_from"
            ? merged[a] > merged[b]
            : merged[a] >= merged[b])
        )
          fail("Thời điểm kết thúc phải sau bắt đầu.");
      if (merged.discount_type === "percent" && merged.discount_value > 100)
        fail("Giảm phần trăm tối đa 100%.");
      if (
        r.table === "users" &&
        Number(id) === u.id &&
        (values.status === "locked" || (values.role && values.role !== "admin"))
      )
        fail("Không tự khóa hoặc hạ quyền chính mình.");
      let resultId;
      await tx(async (c) => {
        if (r.table === "venues" || r.table === "venue_payment_settings")
          await one(
            "SELECT id FROM venues WHERE id=? FOR UPDATE",
            [r.table === "venues" ? id : merged.venue_id],
            c,
          );
        if (
          r.table === "venue_payment_settings" &&
          (await one(
            "SELECT b.id FROM bookings b JOIN courts ct ON ct.id=b.court_id WHERE ct.venue_id=? AND b.status='pending' AND b.hold_expires_at>NOW() LIMIT 1 FOR UPDATE",
            [merged.venue_id],
            c,
          ))
        )
          fail(
            "Còn đơn chờ thanh toán. Chờ hết hạn hoặc xử lý đơn trước khi đổi ngân hàng.",
            409,
          );
        if (r.table === "services" && m === "PATCH") {
          const current = await one(
            "SELECT * FROM services WHERE id=? FOR UPDATE",
            [id],
            c,
          );
          if (
            values.type &&
            values.type !== current.type &&
            (await one(
              "SELECT id FROM service_order_items WHERE service_id=? LIMIT 1",
              [id],
              c,
            ))
          )
            fail(
              "Dịch vụ đã có giao dịch. Tạo dịch vụ mới khi đổi loại bán/thuê.",
              409,
            );
          if (values.venue_id && values.venue_id !== current.venue_id)
            fail("Không chuyển kho dịch vụ sang cơ sở khác.", 409);
        }
        if (r.table === "venues" && (values.open_time || values.close_time)) {
          const conflict = await one(
            "SELECT b.id FROM bookings b JOIN courts ct ON ct.id=b.court_id WHERE ct.venue_id=? AND b.end_at>NOW() AND b.status IN ('pending','confirmed','checked_in','cancel_requested') AND (TIME(b.start_at)<? OR TIME(b.end_at)>?) LIMIT 1",
            [id, merged.open_time, merged.close_time],
            c,
          );
          if (conflict) fail("Giờ mới xung đột booking hiện có.", 409);
        }
        if (
          r.table === "maintenance_blocks" &&
          (m === "POST" || merged.active)
        ) {
          await one(
            "SELECT id FROM courts WHERE id=? FOR UPDATE",
            [merged.court_id],
            c,
          );
          const conflict = await one(
            "SELECT id FROM bookings WHERE court_id=? AND (status IN ('confirmed','checked_in','cancel_requested') OR (status='pending' AND hold_expires_at>NOW())) AND start_at<? AND end_at>? LIMIT 1",
            [merged.court_id, merged.end_at, merged.start_at],
            c,
          );
          if (conflict) fail("Lịch bảo trì trùng booking đang giữ.", 409);
        }
        const keys = Object.keys(values);
        if (m === "PATCH") {
          await c.execute(
            `UPDATE ${r.table} t SET ${keys.map((k) => "t." + k + "=?").join(",")} WHERE t.${idCol}=? AND ${r.scope}`,
            [...Object.values(values), id, scopeId],
          );
          resultId = id;
        } else {
          const [result] = await c.execute(
            `INSERT INTO ${r.table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
            Object.values(values),
          );
          resultId = result.insertId || values[idCol];
        }
        if (
          r.table === "users" &&
          ((values.status && values.status !== "active") ||
            (values.role && values.role !== old.role))
        )
          await c.execute("DELETE FROM auth_sessions WHERE user_id=?", [id]);
        if (r.table === "staff_assignments" && values.active === false)
          await c.execute("DELETE FROM auth_sessions WHERE user_id=?", [
            old.staff_id,
          ]);
        await audit(
          u.id,
          m === "POST" ? "create_resource" : "update_resource",
          r.table,
          Number(resultId) || null,
          null,
          { fields: keys },
          req,
          c,
        );
      });
      return json(res, m === "POST" ? 201 : 200, { id: resultId });
    }
    // Customer support, with scoped owner access and a persistent conversation.
    if (p === "/api/support" && ["GET", "POST"].includes(m)) {
      const u = await requireUser(req, res);
      if (!u) return true;
      if (m === "GET")
        return json(res, 200, {
          tickets: await all(
            `SELECT t.*,u.full_name,v.name AS venue_name FROM support_tickets t JOIN users u ON u.id=t.user_id LEFT JOIN venues v ON v.id=t.venue_id WHERE t.user_id=? OR ?='admin' OR (?='owner' AND v.owner_id=?) ORDER BY t.updated_at DESC LIMIT 200`,
            [u.id, u.role, u.role, u.id],
          ),
        });
      const b = await readBody(req),
        venue = b.venue_id ? integer(b.venue_id, "Cơ sở", 1) : null;
      if (
        venue &&
        !(await one("SELECT id FROM venues WHERE id=? AND status='active'", [
          venue,
        ]))
      )
        fail("Cơ sở không hợp lệ.");
      const [r] = await pool.execute(
        "INSERT INTO support_tickets(user_id,venue_id,subject,message) VALUES(?,?,?,?)",
        [
          u.id,
          venue,
          text(b.subject, "Tiêu đề", 200),
          text(b.message, "Nội dung", 10000),
        ],
      );
      return json(res, 201, { id: r.insertId });
    }
    match = p.match(/^\/api\/support\/(\d+)$/);
    if (match) {
      const u = await requireUser(req, res);
      if (!u) return true;
      const t = await one("SELECT * FROM support_tickets WHERE id=?", [
        Number(match[1]),
      ]);
      if (!t) fail("Không có yêu cầu.", 404);
      if (t.user_id !== u.id) {
        if (u.role !== "admin") {
          if (u.role !== "owner" || !t.venue_id) fail("Không có quyền.", 403);
          await accessVenue(u, t.venue_id);
        }
      }
      if (m === "GET")
        return json(res, 200, {
          ticket: t,
          replies: await all(
            "SELECT r.*,u.full_name FROM support_replies r JOIN users u ON u.id=r.user_id WHERE r.ticket_id=? ORDER BY r.id",
            [t.id],
          ),
        });
      if (m === "POST") {
        const b = await readBody(req);
        await tx(async (c) => {
          await c.execute(
            "INSERT INTO support_replies(ticket_id,user_id,message) VALUES(?,?,?)",
            [t.id, u.id, text(b.message, "Phản hồi", 10000)],
          );
          const status = b.status
            ? choice(
                b.status,
                ["open", "in_progress", "resolved", "closed"],
                "Trạng thái",
              )
            : t.status;
          await c.execute(
            "UPDATE support_tickets SET status=?,updated_at=NOW() WHERE id=?",
            [status, t.id],
          );
          if (t.user_id !== u.id)
            await notify(
              t.user_id,
              "support_reply",
              "Có phản hồi hỗ trợ",
              t.subject,
              "support_ticket",
              t.id,
              c,
            );
        });
        return json(res, 200, { ok: true });
      }
    }
    if (p === "/api/services" && m === "GET") {
      const u = await requireUser(req, res);
      if (!u) return true;
      const b = await accessibleBooking(
        u,
        integer(url.searchParams.get("booking_id"), "Booking", 1),
      );
      return json(res, 200, {
        services: await all(
          "SELECT * FROM services WHERE venue_id=? AND active=TRUE",
          [b.venue_id],
        ),
      });
    }
    if (p === "/api/orders" && m === "GET") {
      const u = await requireUser(req, res);
      if (!u) return true;
      return json(res, 200, {
        orders: await all(
          `SELECT o.*,b.booking_code,COALESCE(b.guest_name,u.full_name) AS full_name FROM service_orders o JOIN bookings b ON b.id=o.booking_id LEFT JOIN users u ON u.id=o.user_id JOIN venues v ON v.id=o.venue_id WHERE o.user_id=? OR v.owner_id=? OR ?='admin' OR (?='receptionist' AND EXISTS(SELECT 1 FROM staff_assignments sa WHERE sa.staff_id=? AND sa.venue_id=o.venue_id AND sa.active=TRUE)) ORDER BY o.id DESC LIMIT 200`,
          [u.id, u.id, u.role, u.role, u.id],
        ),
        items: await all(
          `SELECT oi.*,s.name,s.type FROM service_order_items oi JOIN service_orders o ON o.id=oi.order_id JOIN services s ON s.id=oi.service_id JOIN venues v ON v.id=o.venue_id WHERE o.user_id=? OR v.owner_id=? OR ?='admin' OR (?='receptionist' AND EXISTS(SELECT 1 FROM staff_assignments sa WHERE sa.staff_id=? AND sa.venue_id=o.venue_id AND sa.active=TRUE))`,
          [u.id, u.id, u.role, u.role, u.id],
        ),
      });
    }
    if (p === "/api/orders" && m === "POST") {
      const u = await requireUser(req, res, [
        "customer",
        "coach",
        "owner",
        "receptionist",
      ]);
      if (!u) return true;
      const b = await readBody(req);
      const id = await tx(async (c) => {
        const booking = await accessibleBooking(
          u,
          integer(b.booking_id, "Booking", 1),
          c,
          true,
        );
        if (!["confirmed", "checked_in"].includes(booking.status))
          fail(
            "Chỉ thêm dịch vụ cho booking đã xác nhận hoặc đang sử dụng.",
            409,
          );
        if (!Array.isArray(b.items) || !b.items.length || b.items.length > 20)
          fail("Chọn 1–20 mặt hàng.");
        const items = b.items
          .map((i) => ({
            id: integer(i.service_id, "Dịch vụ", 1),
            qty: integer(i.quantity, "Số lượng", 1, 100),
          }))
          .sort((a, b) => a.id - b.id);
        if (new Set(items.map((i) => i.id)).size !== items.length)
          fail("Không lặp mặt hàng.");
        let amount = 0;
        for (const i of items) {
          i.service = await one(
            "SELECT * FROM services WHERE id=? AND venue_id=? AND active=TRUE FOR UPDATE",
            [i.id, booking.venue_id],
            c,
          );
          if (!i.service || i.service.stock_quantity < i.qty)
            fail("Mặt hàng hết hoặc thiếu tồn kho.", 409);
          amount += i.qty * i.service.price;
        }
        integer(amount, "Tổng tiền");
        const [o] = await c.execute(
          "INSERT INTO service_orders(order_code,booking_id,user_id,venue_id,amount) VALUES(?,?,?,?,?)",
          [
            "DV" + createSessionToken().slice(0, 16).toUpperCase(),
            booking.id,
            booking.user_id,
            booking.venue_id,
            amount,
          ],
        );
        for (const i of items) {
          await c.execute(
            "INSERT INTO service_order_items(order_id,service_id,quantity,unit_price) VALUES(?,?,?,?)",
            [o.insertId, i.id, i.qty, i.service.price],
          );
          await c.execute(
            "UPDATE services SET stock_quantity=stock_quantity-? WHERE id=?",
            [i.qty, i.id],
          );
        }
        await audit(
          u.id,
          "create_service_order",
          "service_order",
          o.insertId,
          null,
          { amount },
          req,
          c,
        );
        return o.insertId;
      });
      return json(res, 201, { id });
    }
    match = p.match(/^\/api\/orders\/(\d+)$/);
    if (match && m === "PATCH") {
      const u = await requireUser(req, res);
      if (!u) return true;
      const b = await readBody(req);
      await tx(async (c) => {
        const o = await one(
          "SELECT * FROM service_orders WHERE id=? FOR UPDATE",
          [Number(match[1])],
          c,
        );
        if (!o) fail("Không có đơn.", 404);
        const manager = ["owner", "receptionist", "admin"].includes(u.role);
        if (manager) await accessVenue(u, o.venue_id, c);
        else if (o.user_id !== u.id) fail("Không có quyền.", 403);
        const items = await all(
          "SELECT oi.*,s.type FROM service_order_items oi JOIN services s ON s.id=oi.service_id WHERE oi.order_id=? ORDER BY oi.service_id FOR UPDATE",
          [o.id],
          c,
        );
        if (b.action === "cancel") {
          if (o.status !== "pending") fail("Chỉ hủy đơn chưa thanh toán.", 409);
          for (const i of items)
            await c.execute(
              "UPDATE services SET stock_quantity=stock_quantity+? WHERE id=?",
              [i.quantity, i.service_id],
            );
          await c.execute(
            "UPDATE service_order_items SET status='cancelled' WHERE order_id=?",
            [o.id],
          );
          await c.execute(
            "UPDATE service_orders SET status='cancelled' WHERE id=?",
            [o.id],
          );
        } else {
          if (!manager) fail("Nhân viên xác nhận thu tiền và bàn giao.", 403);
          if (b.action === "pay") {
            if (o.status !== "pending") fail("Đơn đã xử lý.", 409);
            await c.execute(
              "UPDATE service_orders SET status='paid',paid_at=NOW(),payment_ref=? WHERE id=?",
              [text(b.payment_ref, "Mã thu tiền / chuyển khoản", 120), o.id],
            );
          } else if (b.action === "deliver") {
            if (o.status !== "paid") fail("Cần thu tiền trước bàn giao.", 409);
            await c.execute(
              "UPDATE service_order_items SET status='delivered',handed_over_at=NOW(),condition_out=? WHERE order_id=?",
              [String(b.condition_out || "Tốt").slice(0, 255), o.id],
            );
            await c.execute("UPDATE service_orders SET status=? WHERE id=?", [
              items.some((i) => i.type === "rental")
                ? "delivered"
                : "completed",
              o.id,
            ]);
          } else if (b.action === "return") {
            if (o.status !== "delivered")
              fail("Đơn chưa bàn giao hoặc đã trả.", 409);
            let fee = integer(b.damage_fee || 0, "Phí mất/hỏng");
            for (const i of items.filter((i) => i.type === "rental")) {
              const lost = integer(
                b.lost?.[i.id] || 0,
                "Số lượng mất/hỏng",
                0,
                i.quantity,
              );
              await c.execute(
                "UPDATE services SET stock_quantity=stock_quantity+? WHERE id=?",
                [i.quantity - lost, i.service_id],
              );
              await c.execute(
                "UPDATE service_order_items SET status='returned',returned_at=NOW(),returned_quantity=?,lost_quantity=?,condition_in=? WHERE id=?",
                [
                  i.quantity - lost,
                  lost,
                  String(b.condition_in || "Tốt").slice(0, 255),
                  i.id,
                ],
              );
            }
            if (fee && !b.payment_ref) fail("Nhập chứng từ thu phí mất/hỏng.");
            await c.execute(
              "UPDATE service_orders SET status='completed',damage_fee=? WHERE id=?",
              [fee, o.id],
            );
          } else fail("Thao tác không hợp lệ.");
        }
        await audit(
          u.id,
          "service_" + b.action,
          "service_order",
          o.id,
          { status: o.status },
          { damage_fee: b.damage_fee || 0, payment_ref: b.payment_ref || null },
          req,
          c,
        );
      });
      return json(res, 200, { ok: true });
    }
    if (p === "/api/coach/schedules" && m === "GET") {
      const u = await requireUser(req, res, ["coach"]);
      if (!u) return true;
      return json(res, 200, {
        schedules: await all(
          "SELECT cs.*,b.start_at,b.end_at,b.booking_code,b.status AS booking_status,c.name AS court_name FROM coach_schedules cs JOIN bookings b ON b.id=cs.booking_id JOIN courts c ON c.id=b.court_id WHERE cs.coach_id=? ORDER BY b.start_at",
          [u.id],
        ),
      });
    }
    if (p === "/api/coach/schedules" && m === "POST") {
      const u = await requireUser(req, res, ["coach"]);
      if (!u) return true;
      const b = await readBody(req),
        booking = await accessibleBooking(
          u,
          integer(b.booking_id, "Booking", 1),
        );
      if (
        booking.user_id !== u.id ||
        !["pending", "confirmed"].includes(booking.status)
      )
        fail("Booking không hợp lệ.", 409);
      const [r] = await pool.execute(
        "INSERT INTO coach_schedules(coach_id,booking_id,class_name,participant_limit,note) VALUES(?,?,?,?,?)",
        [
          u.id,
          booking.id,
          text(b.class_name, "Tên lớp", 150),
          integer(b.participant_limit, "Học viên", 1, 100),
          String(b.note || "").slice(0, 500),
        ],
      );
      return json(res, 201, { id: r.insertId });
    }
    match = p.match(/^\/api\/coach\/schedules\/(\d+)$/);
    if (match && m === "PATCH") {
      const u = await requireUser(req, res, ["coach"]);
      if (!u) return true;
      const b = await readBody(req);
      await tx(async (c) => {
        const row = await one(
          "SELECT * FROM coach_schedules WHERE id=? AND coach_id=? FOR UPDATE",
          [Number(match[1]), u.id],
          c,
        );
        if (!row) fail("Không có lịch.", 404);
        const booking = await accessibleBooking(u, row.booking_id, c, true);
        if (b.start_at && b.end_at) {
          if (!["pending", "confirmed"].includes(booking.status))
            fail("Chỉ đổi giờ booking chưa sử dụng.", 409);
          if (
            new Date(
              String(booking.start_at).replace(" ", "T") + "+07:00",
            ).getTime() <= Date.now()
          )
            fail("Buổi dạy đã đến giờ.", 409);
          if (
            await one(
              "SELECT id FROM service_orders WHERE booking_id=? AND status<>'cancelled' LIMIT 1",
              [booking.id],
              c,
            )
          )
            fail("Cần xử lý đơn dịch vụ trước khi đổi lịch.", 409);
          const court = await one(
            "SELECT ct.*,v.open_time,v.close_time FROM courts ct JOIN venues v ON v.id=ct.venue_id WHERE ct.id=? FOR UPDATE",
            [booking.court_id],
            c,
          );
          const [start, end] = validateSlot(court, b.start_at, b.end_at);
          if (
            (await one(
              "SELECT id FROM bookings WHERE court_id=? AND id<>? AND (status IN ('confirmed','checked_in','cancel_requested') OR (status='pending' AND hold_expires_at>NOW())) AND start_at<? AND end_at>? LIMIT 1 FOR UPDATE",
              [court.id, booking.id, end, start],
              c,
            )) ||
            (await one(
              "SELECT id FROM maintenance_blocks WHERE court_id=? AND active=TRUE AND start_at<? AND end_at>? LIMIT 1 FOR UPDATE",
              [court.id, end, start],
              c,
            ))
          )
            fail("Giờ mới không còn trống.", 409);
          if (
            (await ctx.moneyRule(court.id, start, c)) !==
            Number(booking.subtotal)
          )
            fail(
              "Giờ mới có giá khác. Hãy hủy và đặt lại để tính đúng thanh toán.",
              409,
            );
          await c.execute(
            "UPDATE bookings SET start_at=?,end_at=? WHERE id=?",
            [start, end, booking.id],
          );
          await audit(
            u.id,
            "reschedule_coach",
            "booking",
            booking.id,
            { start_at: booking.start_at },
            { start_at: start },
            req,
            c,
          );
        }
        await c.execute(
          "UPDATE coach_schedules SET class_name=?,participant_limit=?,note=? WHERE id=?",
          [
            text(b.class_name, "Tên lớp", 150),
            integer(b.participant_limit, "Học viên", 1, 100),
            String(b.note || "").slice(0, 500),
            row.id,
          ],
        );
      });
      return json(res, 200, { ok: true });
    }
    if (p === "/api/reports" && m === "GET") {
      const u = await requireUser(req, res, ["owner", "admin"]);
      if (!u) return true;
      const from =
          url.searchParams.get("from") ||
          new Date().toISOString().slice(0, 8) + "01",
        to =
          url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
      dateTime(from + " 00:00:00");
      dateTime(to + " 00:00:00");
      if (from > to || Date.parse(to) - Date.parse(from) > 365 * 86400000)
        fail("Chọn khoảng ngày tối đa 366 ngày.");
      const scope = u.role === "admin" ? "1=?" : "v.owner_id=?",
        key = u.role === "admin" ? 1 : u.id;
      const daily = await all(
        `SELECT DATE(p.paid_at) AS date,SUM(p.amount) AS amount,COUNT(*) AS transactions FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN courts ct ON ct.id=b.court_id JOIN venues v ON v.id=ct.venue_id WHERE p.status IN ('paid','refund_pending','refunded') AND DATE(p.paid_at) BETWEEN ? AND ? AND ${scope} GROUP BY DATE(p.paid_at) ORDER BY date`,
        [from, to, key],
      );
      const services = await all(
        `SELECT DATE(o.paid_at) AS date,SUM(o.amount+o.damage_fee) AS amount,COUNT(*) AS orders FROM service_orders o JOIN venues v ON v.id=o.venue_id WHERE o.status IN ('paid','delivered','completed') AND DATE(o.paid_at) BETWEEN ? AND ? AND ${scope} GROUP BY DATE(o.paid_at) ORDER BY date`,
        [from, to, key],
      );
      const courts = await all(
        `SELECT ct.id,ct.name,v.open_time,v.close_time,COUNT(b.id) AS bookings,COALESCE(SUM(TIMESTAMPDIFF(MINUTE,b.start_at,b.end_at)),0) AS used_minutes,TIMESTAMPDIFF(MINUTE,CONCAT(CURDATE(),' ',v.open_time),CONCAT(CURDATE(),' ',v.close_time))*(DATEDIFF(?,?)+1) AS capacity_minutes FROM courts ct JOIN venues v ON v.id=ct.venue_id LEFT JOIN bookings b ON b.court_id=ct.id AND DATE(b.start_at) BETWEEN ? AND ? AND b.status IN ('confirmed','checked_in','completed','no_show','cancel_requested') WHERE ${scope} GROUP BY ct.id,v.open_time,v.close_time ORDER BY bookings DESC`,
        [to, from, from, to, key],
      );
      const blocks = await all(
        `SELECT mb.court_id,mb.start_at,mb.end_at FROM maintenance_blocks mb JOIN courts ct ON ct.id=mb.court_id JOIN venues v ON v.id=ct.venue_id WHERE mb.active=TRUE AND mb.start_at<DATE_ADD(?,INTERVAL 1 DAY) AND mb.end_at>? AND ${scope}`,
        [to, from, key],
      );
      const refunds = await all(
        `SELECT DATE(rr.reviewed_at) AS date,SUM(rr.approved_amount) AS amount,COUNT(*) AS transactions FROM refund_requests rr JOIN bookings b ON b.id=rr.booking_id JOIN courts ct ON ct.id=b.court_id JOIN venues v ON v.id=ct.venue_id WHERE rr.status='refunded' AND DATE(rr.reviewed_at) BETWEEN ? AND ? AND ${scope} GROUP BY DATE(rr.reviewed_at) ORDER BY date`,
        [from, to, key],
      );
      const hours = await all(
        `SELECT HOUR(b.start_at) AS hour,COUNT(*) AS bookings FROM bookings b JOIN courts ct ON ct.id=b.court_id JOIN venues v ON v.id=ct.venue_id WHERE DATE(b.start_at) BETWEEN ? AND ? AND b.status IN ('confirmed','checked_in','completed') AND ${scope} GROUP BY HOUR(b.start_at) ORDER BY bookings DESC`,
        [from, to, key],
      );
      const customers = await all(
        `SELECT u.id,u.full_name,u.email,u.created_at,u.loyalty_points,COUNT(b.id) AS bookings,COALESCE(SUM(CASE WHEN p.status='paid' THEN p.amount ELSE 0 END),0) AS spent FROM users u JOIN bookings b ON b.user_id=u.id JOIN courts ct ON ct.id=b.court_id JOIN venues v ON v.id=ct.venue_id LEFT JOIN payments p ON p.booking_id=b.id WHERE DATE(b.start_at) BETWEEN ? AND ? AND ${scope} GROUP BY u.id ORDER BY spent DESC`,
        [from, to, key],
      );
      return json(res, 200, {
        from,
        to,
        daily,
        services,
        refunds,
        net_collected:
          daily.reduce((n, r) => n + r.amount, 0) +
          services.reduce((n, r) => n + r.amount, 0) -
          refunds.reduce((n, r) => n + r.amount, 0),
        courts: courts.map((c) => {
          const blocked = blockedMinutes(
            blocks.filter((b) => b.court_id === c.id),
            from,
            to,
            c.open_time,
            c.close_time,
          );
          const available = Math.max(0, c.capacity_minutes - blocked);
          return {
            ...c,
            blocked_minutes: blocked,
            available_minutes: available,
            utilization: Number(
              ((100 * c.used_minutes) / Math.max(1, available)).toFixed(1),
            ),
          };
        }),
        hours,
        customers,
      });
    }
    if (p === "/api/transactions" && m === "GET") {
      const u = await requireUser(req, res);
      if (!u) return true;
      return json(res, 200, {
        transactions: await all(
          `SELECT p.*,b.booking_code,v.name AS venue_name FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN courts ct ON ct.id=b.court_id JOIN venues v ON v.id=ct.venue_id WHERE b.user_id=? OR v.owner_id=? OR ?='admin' ORDER BY p.id DESC LIMIT 300`,
          [u.id, u.id, u.role],
        ),
      });
    }
    if (p === "/api/admin/payment-events" && m === "GET") {
      const u = await requireUser(req, res, ["admin"]);
      if (!u) return true;
      return json(res, 200, {
        events: await all(
          "SELECT id,provider,event_id,booking_id,amount,status,note,created_at FROM payment_events ORDER BY id DESC LIMIT 300",
        ),
      });
    }
    if (p === "/api/admin/errors" && m === "GET") {
      const u = await requireUser(req, res, ["admin"]);
      if (!u) return true;
      return json(res, 200, {
        errors: await all(
          "SELECT * FROM system_errors ORDER BY id DESC LIMIT 200",
        ),
      });
    }
    if (p === "/api/admin/backups" && m === "GET") {
      const u = await requireUser(req, res, ["admin"]);
      if (!u) return true;
      return json(res, 200, {
        backups: await all(
          "SELECT * FROM backup_jobs ORDER BY id DESC LIMIT 100",
        ),
      });
    }
    if (p === "/api/admin/backups" && m === "POST") {
      const u = await requireUser(req, res, ["admin"]);
      if (!u) return true;
      const [r] = await pool.execute(
        "INSERT INTO backup_jobs(requested_by,status) VALUES(?,'queued')",
        [u.id],
      );
      return json(res, 202, {
        id: r.insertId,
        message: "Đã xếp lịch sao lưu. Worker sẽ thực thi.",
      });
    }
    match = p.match(/^\/api\/admin\/backups\/(\d+)\/download$/);
    if (match && m === "GET") {
      const u = await requireUser(req, res, ["admin"]);
      if (!u) return true;
      const row = await one(
        "SELECT * FROM backup_jobs WHERE id=? AND status='completed'",
        [Number(match[1])],
      );
      if (!row) fail("Bản sao lưu chưa sẵn sàng.", 404);
      res.writeHead(200, {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${row.file_name}"`,
        "Cache-Control": "no-store",
      });
      await pipeline(createReadStream(backupPath(row.file_name)), res);
      return true;
    }
    match = p.match(/^\/api\/owner\/refunds\/(\d+)$/);
    if (match && m === "PATCH") {
      const u = await requireUser(req, res, ["owner"]);
      if (!u) return true;
      const b = await readBody(req);
      await tx(async (c) => {
        const r = await one(
          `SELECT rr.*,ct.venue_id,b.user_id FROM refund_requests rr JOIN bookings b ON b.id=rr.booking_id JOIN courts ct ON ct.id=b.court_id WHERE rr.id=? FOR UPDATE`,
          [Number(match[1])],
          c,
        );
        if (!r) fail("Không có yêu cầu.", 404);
        await accessVenue(u, r.venue_id, c);
        const allowed = {
          pending: ["approved", "rejected"],
          approved: ["refunded"],
        };
        if (!(allowed[r.status] || []).includes(b.status))
          fail("Không thể chuyển trạng thái hoàn tiền.", 409);
        const amount =
          b.status === "rejected"
            ? 0
            : integer(
                b.approved_amount ?? r.approved_amount ?? r.requested_amount,
                "Tiền hoàn",
                0,
                r.requested_amount,
              );
        if (b.status === "refunded")
          text(b.transaction_ref, "Chứng từ hoàn tiền", 120);
        await c.execute(
          "UPDATE refund_requests SET status=?,approved_amount=?,review_note=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?",
          [
            b.status,
            amount,
            String(b.review_note || "").slice(0, 500),
            u.id,
            r.id,
          ],
        );
        if (b.status === "approved") {
          await c.execute("UPDATE bookings SET status='cancelled' WHERE id=?", [
            r.booking_id,
          ]);
          await c.execute(
            "UPDATE payments SET status='refund_pending' WHERE booking_id=? AND status='paid'",
            [r.booking_id],
          );
          await c.execute(
            "UPDATE coach_schedules SET status='cancelled' WHERE booking_id=?",
            [r.booking_id],
          );
        }
        if (b.status === "refunded")
          await c.execute(
            "UPDATE payments SET status='refunded' WHERE booking_id=? AND status='refund_pending'",
            [r.booking_id],
          );
        if (b.status === "rejected")
          await c.execute(
            "UPDATE bookings SET status='confirmed' WHERE id=? AND status='cancel_requested'",
            [r.booking_id],
          );
        await notify(
          r.user_id,
          "refund_review",
          "Cập nhật hoàn tiền",
          `Trạng thái ${b.status}; số tiền ${amount}đ.`,
          "booking",
          r.booking_id,
          c,
        );
        await audit(
          u.id,
          "refund_" + b.status,
          "refund_request",
          r.id,
          { status: r.status },
          { amount, transaction_ref: b.transaction_ref || null },
          req,
          c,
        );
      });
      return json(res, 200, { ok: true });
    }
    match = p.match(/^\/api\/owner\/maintenance\/(\d+)$/);
    if (match && m === "PATCH") {
      const u = await requireUser(req, res, ["owner"]);
      if (!u) return true;
      const b = await readBody(req);
      await tx(async (c) => {
        const r = await one(
          "SELECT mr.*,ct.venue_id FROM maintenance_requests mr JOIN courts ct ON ct.id=mr.court_id WHERE mr.id=? FOR UPDATE",
          [Number(match[1])],
          c,
        );
        if (!r) fail("Không có yêu cầu.", 404);
        await accessVenue(u, r.venue_id, c);
        const transitions = {
          open: ["assigned", "rejected"],
          assigned: ["in_progress", "rejected"],
          in_progress: ["resolved", "closed"],
          waiting_approval: ["assigned", "closed", "rejected"],
          resolved: ["closed"],
        };
        const status = choice(
          b.status,
          ["assigned", "in_progress", "resolved", "closed", "rejected"],
          "Trạng thái",
        );
        if (!(transitions[r.status] || []).includes(status))
          fail("Không thể chuyển trạng thái.", 409);
        const assigned = b.assigned_to
          ? integer(b.assigned_to, "Nhân viên", 1)
          : r.assigned_to;
        if (
          assigned &&
          !(await one(
            "SELECT sa.id FROM staff_assignments sa JOIN users u ON u.id=sa.staff_id WHERE sa.staff_id=? AND sa.venue_id=? AND sa.active=TRUE AND u.role='technician' AND u.status='active'",
            [assigned, r.venue_id],
            c,
          ))
        )
          fail("Kỹ thuật viên chưa được phân công cơ sở.");
        if (status === "assigned" && !assigned) fail("Chọn kỹ thuật viên.");
        if (b.block_start && b.block_end) {
          const start = dateTime(b.block_start),
            end = dateTime(b.block_end);
          if (start >= end) fail("Lịch bảo trì không hợp lệ.");
          await one(
            "SELECT id FROM courts WHERE id=? FOR UPDATE",
            [r.court_id],
            c,
          );
          if (
            await one(
              "SELECT id FROM bookings WHERE court_id=? AND (status IN ('confirmed','checked_in','cancel_requested') OR (status='pending' AND hold_expires_at>NOW())) AND start_at<? AND end_at>? LIMIT 1",
              [r.court_id, end, start],
              c,
            )
          )
            fail("Lịch bảo trì trùng booking.", 409);
          await c.execute(
            "INSERT INTO maintenance_blocks(court_id,request_id,start_at,end_at,reason,created_by) VALUES(?,?,?,?,?,?)",
            [r.court_id, r.id, start, end, r.title, u.id],
          );
        }
        await c.execute(
          "UPDATE maintenance_requests SET status=?,assigned_to=?,resolved_at=IF(? IN ('resolved','closed'),NOW(),resolved_at) WHERE id=?",
          [status, assigned, status, r.id],
        );
        if (status === "closed")
          await c.execute(
            "UPDATE maintenance_blocks SET active=FALSE WHERE request_id=?",
            [r.id],
          );
        if (assigned)
          await notify(
            assigned,
            "maintenance",
            "Cập nhật nhiệm vụ",
            r.title,
            "maintenance_request",
            r.id,
            c,
          );
        await audit(
          u.id,
          "manage_maintenance",
          "maintenance_request",
          r.id,
          { status: r.status },
          { status, assigned_to: assigned },
          req,
          c,
        );
      });
      return json(res, 200, { ok: true });
    }
    // Prevent legacy mutations from escaping assigned venue or task ownership.
    match = p.match(/^\/api\/staff\/(maintenance|cleaning)\/(\d+)$/);
    if (match && m === "PATCH") {
      const u = await requireUser(
        req,
        res,
        match[1] === "maintenance" ? ["technician"] : ["cleaner"],
      );
      if (!u) return true;
      const table =
        match[1] === "maintenance" ? "maintenance_requests" : "cleaning_tasks";
      const b = await readBody(req);
      await tx(async (c) => {
        const row = await one(
          `SELECT t.*,ct.venue_id FROM ${table} t JOIN courts ct ON ct.id=t.court_id WHERE t.id=? FOR UPDATE`,
          [Number(match[2])],
          c,
        );
        if (!row) fail("Không có nhiệm vụ.", 404);
        await accessVenue(u, row.venue_id, c);
        if (row.assigned_to && row.assigned_to !== u.id)
          fail("Nhiệm vụ đã giao cho nhân viên khác.", 403);
        const transitions =
          match[1] === "maintenance"
            ? {
                open: ["assigned"],
                assigned: ["in_progress", "waiting_approval"],
                in_progress: ["resolved", "waiting_approval"],
                waiting_approval: [],
              }
            : {
                pending: ["assigned"],
                assigned: ["in_progress"],
                in_progress: ["completed", "blocked"],
                blocked: ["in_progress"],
              };
        if (!(transitions[row.status] || []).includes(b.status))
          fail("Không thể chuyển trạng thái nhiệm vụ.", 409);
        if (match[1] === "maintenance")
          await c.execute(
            "UPDATE maintenance_requests SET assigned_to=?,status=?,proposed_start=?,proposed_end=?,resolved_at=IF(?='resolved',NOW(),resolved_at) WHERE id=?",
            [
              u.id,
              b.status,
              b.proposed_start
                ? dateTime(b.proposed_start)
                : row.proposed_start,
              b.proposed_end ? dateTime(b.proposed_end) : row.proposed_end,
              b.status,
              row.id,
            ],
          );
        else {
          await c.execute(
            "UPDATE cleaning_tasks SET assigned_to=?,status=?,started_at=IF(?='in_progress',NOW(),started_at),completed_at=IF(?='completed',NOW(),completed_at),issue_note=? WHERE id=?",
            [
              u.id,
              b.status,
              b.status,
              b.status,
              String(b.issue_note || "").slice(0, 500),
              row.id,
            ],
          );
          if (b.status === "in_progress")
            await c.execute(
              "UPDATE courts SET current_state='cleaning' WHERE id=?",
              [row.court_id],
            );
          if (b.status === "completed")
            await c.execute(
              "UPDATE courts SET current_state='ready' WHERE id=? AND NOT EXISTS(SELECT 1 FROM cleaning_tasks WHERE court_id=? AND status IN ('in_progress','blocked'))",
              [row.court_id, row.court_id],
            );
          if (b.status === "blocked") {
            const note = text(b.issue_note, "Sự cố", 500);
            await c.execute(
              "INSERT INTO maintenance_requests(court_id,reported_by,title,description,priority) VALUES(?,?,'Sự cố khi vệ sinh',?,'high')",
              [row.court_id, u.id, note],
            );
            const owner = await one(
              "SELECT owner_id FROM venues WHERE id=?",
              [row.venue_id],
              c,
            );
            await notify(
              owner.owner_id,
              "maintenance",
              "Sự cố khi vệ sinh",
              note,
              "court",
              row.court_id,
              c,
            );
          }
        }
        await audit(
          u.id,
          "task_status",
          table,
          row.id,
          { status: row.status },
          { status: b.status },
          req,
          c,
        );
      });
      return json(res, 200, { ok: true });
    }
    if (p === "/api/staff/maintenance" && m === "POST") {
      const u = await requireUser(req, res, ["receptionist", "technician"]);
      if (!u) return true;
      const b = await readBody(req);
      req.n01Body = b;
      const ct = await one("SELECT venue_id FROM courts WHERE id=?", [
        integer(b.court_id, "Sân", 1),
      ]);
      if (!ct) fail("Sân không tồn tại.", 404);
      await accessVenue(u, ct.venue_id);
      text(b.title, "Tiêu đề", 200);
      text(b.description, "Mô tả", 10000);
      choice(
        b.priority || "medium",
        ["low", "medium", "high", "urgent"],
        "Ưu tiên",
      );
    }
    if (
      p.match(/^\/api\/bookings\/\d+\/pay$/) &&
      m === "POST" &&
      (process.env.PAYMENT_MODE !== "demo" ||
        process.env.NODE_ENV === "production")
    )
      fail("Thanh toán được xác nhận qua ngân hàng.", 403);
    if (p.match(/^\/api\/bookings\/\d+\/cancel$/) && m === "POST") {
      const u = await requireUser(req, res, ["customer", "coach"]);
      if (!u) return true;
      const b = await accessibleBooking(u, Number(p.split("/")[3]));
      if (
        new Date(String(b.start_at).replace(" ", "T") + "+07:00").getTime() <=
        Date.now()
      )
        fail("Đã đến giờ sử dụng. Liên hệ chủ sân để xử lý.", 409);
      if (
        await one(
          "SELECT id FROM service_orders WHERE booking_id=? AND status NOT IN ('cancelled') LIMIT 1",
          [b.id],
        )
      )
        fail("Liên hệ chủ sân xử lý đơn dịch vụ trước khi hủy sân.", 409);
    }
    if (
      m === "POST" &&
      [
        "/api/owner/courts",
        "/api/owner/staff",
        "/api/owner/promotions",
        "/api/admin/users",
      ].includes(p)
    ) {
      const b = await readBody(req);
      if (b.password !== undefined) text(b.password, "Mật khẩu", 128, 10);
      if (p === "/api/owner/courts") {
        text(b.name, "Tên sân", 150);
        integer(b.base_price, "Giá", 0);
        integer(b.capacity || 10, "Sức chứa", 1, 1000);
        choice(Number(b.slot_minutes || 60), [30, 60, 90, 120], "Slot");
      }
      if (p === "/api/owner/staff") {
        if (dateTime(b.shift_start) >= dateTime(b.shift_end))
          fail("Ca làm không hợp lệ.");
        text(b.full_name, "Họ tên", 150);
      }
      if (p === "/api/owner/promotions") {
        text(b.code, "Mã", 50);
        text(b.name, "Tên", 150);
        choice(b.discount_type, ["percent", "fixed"], "Loại");
        integer(
          b.discount_value,
          "Mức giảm",
          1,
          b.discount_type === "percent" ? 100 : 1000000000,
        );
        if (dateTime(b.starts_at) >= dateTime(b.ends_at))
          fail("Thời hạn không hợp lệ.");
      }
    }
    if (m === "PATCH" && p.match(/^\/api\/admin\/users\/\d+$/)) {
      const u = await requireUser(req, res, ["admin"]);
      if (!u) return true;
      const b = await readBody(req);
      if (
        Number(p.split("/").pop()) === u.id &&
        (b.status === "locked" || (b.role && b.role !== "admin"))
      )
        fail("Không tự khóa hoặc hạ quyền chính mình.");
    }
    return false;
  };
}
