import { createOfflineBooking, collectOfflinePayment } from "./lib/offline-bookings.js";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pool, { pingDatabase } from "./database/mysql.js";
import {
  bookingCode,
  createSessionToken,
  hashPassword,
  tokenHash,
  verifyPassword,
} from "./lib/security.js";
import { featureHandler } from "./lib/features.js";
import {
  securityHeaders,
  guardRequest,
  rateLimit,
} from "./lib/http-security.js";
import { integer, text, fail, dateTime } from "./lib/validation.js";
import { productionChecks } from "./lib/preflight.js";

const root = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const sessionHours = Number(process.env.SESSION_HOURS || 24);
const holdMinutes = Number(process.env.BOOKING_HOLD_MINUTES || 10);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

const inputDate = (value) =>
  String(value || "")
    .replace("T", " ")
    .slice(0, 19);
const todayVietnam = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

function json(res, status, data, headers = {}) {
  if (status >= 500 && data?.error)
    data = {
      error:
        status === 503
          ? "Dịch vụ tạm thời không sẵn sàng."
          : "Lỗi máy chủ. Vui lòng thử lại sau.",
    };
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  if (req.n01Body) return Promise.resolve(req.n01Body);
  if (req.bodyPromise) return req.bodyPromise;
  req.bodyPromise = new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 1_000_000) {
        reject(
          Object.assign(new Error("Dữ liệu gửi lên quá lớn."), { status: 413 }),
        );
        req.pause();
      }
    });
    req.on("end", () => {
      if (!body) return resolveBody({});
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("JSON object required");
        resolveBody(parsed);
      } catch {
        reject(
          Object.assign(new Error("Dữ liệu JSON không hợp lệ."), {
            status: 400,
          }),
        );
      }
    });
    req.on("error", reject);
  });
  return req.bodyPromise;
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((item) => {
        const [key, ...rest] = item.trim().split("=");
        return [key, decodeURIComponent(rest.join("="))];
      }),
  );
}

async function one(sql, params = [], connection = pool) {
  const [rows] = await connection.execute(sql, params);
  return rows[0] || null;
}

async function all(sql, params = [], connection = pool) {
  const [rows] = await connection.execute(sql, params);
  return rows;
}

async function currentUser(req) {
  const token = parseCookies(req).n01_session;
  if (!token) return null;
  return one(
    `
    SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.loyalty_points
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.status = 'active'
  `,
    [tokenHash(token)],
  );
}

async function requireUser(req, res, roles = []) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: "Bạn cần đăng nhập để tiếp tục." });
    return null;
  }
  if (roles.length && !roles.includes(user.role)) {
    json(res, 403, { error: "Bạn không có quyền thực hiện thao tác này." });
    return null;
  }
  return user;
}

async function audit(
  actorId,
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
  req = null,
  connection = pool,
) {
  await connection.execute(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      actorId,
      action,
      entityType,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req?.socket?.remoteAddress || null,
    ],
  );
}

async function notify(
  userId,
  type,
  title,
  message,
  referenceType = null,
  referenceId = null,
  connection = pool,
) {
  await connection.execute(
    `INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, title, message, referenceType, referenceId],
  );
  if (process.env.SMTP_HOST) {
    const u = await one(
      "SELECT email FROM users WHERE id=?",
      [userId],
      connection,
    );
    if (u)
      await connection.execute(
        "INSERT INTO email_outbox(recipient,subject,body) VALUES(?,?,?)",
        [u.email, title, message],
      );
  }
}

async function expireHolds() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [expired] = await connection.execute(
      `SELECT id FROM bookings WHERE status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at <= NOW() FOR UPDATE`,
    );
    if (expired.length) {
      const ids = expired.map((item) => item.id);
      await connection.query(
        `UPDATE bookings SET status = 'expired' WHERE id IN (?)`,
        [ids],
      );
      await connection.query(
        `UPDATE payments SET status = 'failed' WHERE booking_id IN (?) AND status = 'pending'`,
        [ids],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function moneyRule(courtId, startAt, connection = pool) {
  const rule = await one(
    `
    SELECT pr.price FROM price_rules pr
    WHERE pr.court_id = ? AND pr.active = TRUE
      AND (pr.day_of_week = DAYOFWEEK(?) - 1 OR pr.day_of_week IS NULL)
      AND pr.start_time <= TIME(?) AND pr.end_time > TIME(?)
      AND (pr.effective_from IS NULL OR pr.effective_from <= DATE(?))
      AND (pr.effective_to IS NULL OR pr.effective_to >= DATE(?))
    ORDER BY pr.day_of_week IS NULL, pr.id LIMIT 1
  `,
    [courtId, startAt, startAt, startAt, startAt, startAt],
    connection,
  );
  if (rule) return Number(rule.price);
  const court = await one(
    "SELECT base_price FROM courts WHERE id = ?",
    [courtId],
    connection,
  );
  return court ? Number(court.base_price) : null;
}

async function applyPromotion(code, subtotal, userId, courtId, connection) {
  if (!code) return { promotionId: null, discount: 0 };
  await one(
    "SELECT id FROM promotions WHERE code=? FOR UPDATE",
    [code],
    connection,
  );
  const promo = await one(
    `
    SELECT p.*
    FROM promotions p
    JOIN courts c ON c.id = ? JOIN venues v ON v.id = c.venue_id
    WHERE p.code = ? AND p.active = TRUE AND p.starts_at <= NOW() AND p.ends_at >= NOW()
      AND p.owner_id = v.owner_id AND (p.venue_id IS NULL OR p.venue_id = v.id)
    FOR UPDATE
  `,
    [courtId, code],
    connection,
  );
  const uses = promo
    ? await all(
        `SELECT pu.user_id FROM promotion_uses pu JOIN bookings b ON b.id=pu.booking_id WHERE pu.promotion_id=? AND (b.status NOT IN ('pending','cancelled','expired') OR (b.status='pending' AND b.hold_expires_at>NOW())) FOR UPDATE`,
        [promo.id],
        connection,
      )
    : [];
  if (
    !promo ||
    subtotal < promo.min_order_value ||
    (promo.usage_limit && uses.length >= promo.usage_limit)
  ) {
    throw Object.assign(
      new Error("Mã ưu đãi không hợp lệ hoặc chưa đủ điều kiện."),
      { status: 400 },
    );
  }
  const redemption = await one(
    "SELECT user_id FROM reward_redemptions WHERE promotion_id=?",
    [promo.id],
    connection,
  );
  if (redemption && redemption.user_id !== userId)
    fail("Mã đổi điểm thuộc khách hàng khác.", 403);
  if (uses.filter((u) => u.user_id === userId).length >= promo.per_user_limit)
    throw Object.assign(new Error("Bạn đã dùng hết lượt của mã ưu đãi này."), {
      status: 400,
    });
  let discount =
    promo.discount_type === "percent"
      ? Math.round((subtotal * promo.discount_value) / 100)
      : Number(promo.discount_value);
  if (promo.max_discount)
    discount = Math.min(discount, Number(promo.max_discount));
  return { promotionId: promo.id, discount: Math.min(discount, subtotal) };
}

async function courtRows(filters = {}, userId = null) {
  const where = [
    "c.status = 'active'",
    "v.status = 'active'",
    "s.status = 'active'",
  ];
  const params = [];
  if (filters.sport) {
    where.push("s.slug = ?");
    params.push(filters.sport);
  }
  if (filters.district) {
    where.push("v.district = ?");
    params.push(filters.district);
  }
  if (filters.query) {
    where.push("(v.name LIKE ? OR c.name LIKE ? OR v.address LIKE ?)");
    params.push(
      `%${filters.query}%`,
      `%${filters.query}%`,
      `%${filters.query}%`,
    );
  }
  const rows = await all(
    `
    SELECT c.id, c.name, c.surface, c.capacity, c.indoor, c.base_price, c.slot_minutes, c.current_state,
      v.id AS venue_id, v.name AS venue_name, v.address, v.district, v.city, v.rating, v.review_count,
      TIME_FORMAT(v.open_time, '%H:%i') AS open_time, TIME_FORMAT(v.close_time, '%H:%i') AS close_time,
      v.latitude,v.longitude,(SELECT image_url FROM venue_images vi WHERE vi.venue_id=v.id ORDER BY sort_order,id LIMIT 1) AS image_url,
      s.slug AS sport_slug, s.name AS sport_name,
      (SELECT GROUP_CONCAT(a.name ORDER BY a.name SEPARATOR ',') FROM venue_amenities va JOIN amenities a ON a.id=va.amenity_id WHERE va.venue_id=v.id) AS amenities,
      EXISTS(SELECT 1 FROM favorites f WHERE f.venue_id=v.id AND f.user_id=?) AS is_favorite
    FROM courts c JOIN venues v ON v.id = c.venue_id JOIN sports s ON s.id = c.sport_id
    WHERE ${where.join(" AND ")} ORDER BY v.rating DESC, c.base_price ASC
  `,
    [userId || 0, ...params],
  );
  return rows.map((row) => ({
    ...row,
    indoor: Boolean(row.indoor),
    is_favorite: Boolean(row.is_favorite),
    amenities: row.amenities ? row.amenities.split(",") : [],
  }));
}

async function slotsForCourt(courtId, date) {
  dateTime(date + " 00:00:00");
  await expireHolds();
  const court = await one(
    `SELECT c.*, TIME_FORMAT(v.open_time, '%H:%i') AS open_time, TIME_FORMAT(v.close_time, '%H:%i') AS close_time
    FROM courts c JOIN venues v ON v.id = c.venue_id WHERE c.id = ? AND c.status = 'active' AND v.status = 'active'`,
    [courtId],
  );
  if (!court)
    throw Object.assign(
      new Error("Không tìm thấy sân hoặc sân đang ngừng hoạt động."),
      { status: 404 },
    );
  const busy = await all(
    `SELECT start_at, end_at FROM bookings WHERE court_id = ?
    AND ((status IN ('confirmed','checked_in','cancel_requested')) OR (status = 'pending' AND hold_expires_at > NOW()))
    AND DATE(start_at) = ?`,
    [courtId, date],
  );
  const blocks = await all(
    `SELECT start_at, end_at FROM maintenance_blocks WHERE court_id = ? AND active = TRUE
    AND start_at < CONCAT(?, ' 23:59:59') AND end_at > CONCAT(?, ' 00:00:00')`,
    [courtId, date, date],
  );
  const [openH, openM] = court.open_time.split(":").map(Number);
  const [closeH, closeM] = court.close_time.split(":").map(Number);
  let minutes = openH * 60 + openM;
  const close = closeH * 60 + closeM;
  const slots = [];
  const hhmm = (value) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  while (minutes + court.slot_minutes <= close) {
    const endMinutes = minutes + court.slot_minutes;
    const startAt = `${date} ${hhmm(minutes)}:00`;
    const endAt = `${date} ${hhmm(endMinutes)}:00`;
    const overlaps = [...busy, ...blocks].some(
      (item) =>
        inputDate(item.start_at) < endAt && inputDate(item.end_at) > startAt,
    );
    slots.push({
      start_at: startAt.replace(" ", "T"),
      end_at: endAt.replace(" ", "T"),
      label: `${hhmm(minutes)} – ${hhmm(endMinutes)}`,
      price: await moneyRule(courtId, startAt),
      available:
        !overlaps &&
        new Date(startAt.replace(" ", "T") + "+07:00").getTime() > Date.now(),
    });
    minutes = endMinutes;
  }
  return slots;
}

async function bookingDetail(id, connection = pool) {
  return one(
    `
    SELECT b.*, c.name AS court_name, s.name AS sport_name, COALESCE(b.guest_name,u.full_name) AS full_name, COALESCE(b.guest_phone,u.phone) AS phone, v.id AS venue_id, v.name AS venue_name, v.address, v.district,
      p.status AS payment_status, p.provider AS payment_provider, p.qr_content, p.transaction_ref
    FROM bookings b JOIN courts c ON c.id = b.court_id JOIN sports s ON s.id = c.sport_id
    JOIN venues v ON v.id = c.venue_id LEFT JOIN users u ON u.id=b.user_id LEFT JOIN payments p ON p.booking_id = b.id WHERE b.id = ?
  `,
    [id],
    connection,
  );
}

function serveStatic(res, url) {
  if (!["GET", "HEAD"].includes(res.req.method))
    return json(res, 405, { error: "Phương thức không hợp lệ." });
  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir + sep))
    return json(res, 403, { error: "Đường dẫn không hợp lệ." });
  if (!existsSync(filePath) || statSync(filePath).isDirectory())
    return json(res, 404, { error: "Không tìm thấy trang hoặc tệp." });
  const ext = extname(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": [".html", ".js", ".css"].includes(ext)
      ? "no-cache"
      : "public, max-age=3600",
  });
  res.end(readFileSync(filePath));
}

async function handlePublic(req, res, url) {
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/health") {
    await pingDatabase();
    return json(res, 200, {
      ok: true,
      service: "N01SPORT API",
      database: "MySQL",
    });
  }
  if (req.method === "GET" && path === "/api/bootstrap") {
    const [sports, districts, user] = await Promise.all([
      all(
        "SELECT id, slug, name, icon_name FROM sports WHERE status = 'active' ORDER BY id",
      ),
      all(
        "SELECT DISTINCT district FROM venues WHERE status = 'active' ORDER BY district",
      ),
      currentUser(req),
    ]);
    return json(res, 200, {
      sports,
      districts: districts.map((item) => item.district),
      user,
    });
  }
  if (req.method === "GET" && path === "/api/courts") {
    const user = await currentUser(req);
    const courts = await courtRows(
      {
        sport: url.searchParams.get("sport"),
        district: url.searchParams.get("district"),
        query: url.searchParams.get("q"),
      },
      user?.id,
    );
    if (url.searchParams.has("lat") && url.searchParams.has("lng")) {
      const lat = Number(url.searchParams.get("lat")),
        lng = Number(url.searchParams.get("lng"));
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      )
        fail("Tọa độ không hợp lệ.");
      const rad = (n) => (n * Math.PI) / 180;
      for (const c of courts) {
        if (c.latitude === null || c.longitude === null) c.distance_km = null;
        else {
          const a =
            Math.sin(rad(c.latitude - lat) / 2) ** 2 +
            Math.cos(rad(lat)) *
              Math.cos(rad(c.latitude)) *
              Math.sin(rad(c.longitude - lng) / 2) ** 2;
          c.distance_km = Number(
            (6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))).toFixed(2),
          );
        }
      }
      courts.sort(
        (a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity),
      );
    }
    return json(res, 200, { courts });
  }
  const slotsMatch = path.match(/^\/api\/courts\/(\d+)\/slots$/);
  if (req.method === "GET" && slotsMatch)
    return json(res, 200, {
      slots: await slotsForCourt(
        Number(slotsMatch[1]),
        url.searchParams.get("date") || todayVietnam(),
      ),
    });
  return false;
}

async function handleAuth(req, res, url) {
  const path = url.pathname;
  if (req.method === "POST" && path === "/api/auth/register") {
    const { full_name, email, phone, password } = await readBody(req);
    if (String(full_name || "").trim().length < 2)
      return json(res, 400, { error: "Họ tên cần ít nhất 2 ký tự." });
    if (!/^\S+@\S+\.\S+$/.test(String(email || "")))
      return json(res, 400, { error: "Email không hợp lệ." });
    text(password, "Mật khẩu", 128, 10);
    text(full_name, "Họ tên", 150, 2);
    text(email, "Email", 255);
    try {
      const [result] = await pool.execute(
        `INSERT INTO users (full_name, email, phone, password_hash, role, status)
        VALUES (?, ?, ?, ?, 'customer', 'active')`,
        [
          String(full_name).trim(),
          String(email).trim().toLowerCase(),
          String(phone || "").trim() || null,
          hashPassword(password),
        ],
      );
      await audit(
        result.insertId,
        "register",
        "user",
        result.insertId,
        null,
        { email },
        req,
      );
      return json(res, 201, {
        ok: true,
        message: "Đăng ký thành công. Bạn có thể đăng nhập.",
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY")
        return json(res, 409, {
          error: "Email hoặc số điện thoại đã được sử dụng.",
        });
      throw error;
    }
  }
  if (req.method === "POST" && path === "/api/auth/login") {
    const { email, password } = await readBody(req);
    text(password, "Mật khẩu", 128);
    text(email, "Email", 255);
    const emailKey = tokenHash(String(email).trim().toLowerCase());
    const attempts = await one(
      "SELECT failures,window_start>DATE_SUB(NOW(),INTERVAL 15 MINUTE) AS active_window FROM auth_attempts WHERE email_hash=?",
      [emailKey],
    );
    if (attempts?.active_window && attempts.failures >= 10)
      fail("Tạm khóa đăng nhập do nhiều lần sai. Thử lại sau 15 phút.", 429);
    const user = await one("SELECT * FROM users WHERE email = ? LIMIT 1", [
      String(email || "")
        .trim()
        .toLowerCase(),
    ]);
    if (!user || !verifyPassword(String(password || ""), user.password_hash)) {
      await pool.execute(
        "INSERT INTO auth_attempts(email_hash,failures) VALUES(?,1) ON DUPLICATE KEY UPDATE failures=IF(window_start>DATE_SUB(NOW(),INTERVAL 15 MINUTE),failures+1,1),window_start=IF(window_start>DATE_SUB(NOW(),INTERVAL 15 MINUTE),window_start,NOW())",
        [emailKey],
      );
      await audit(
        user?.id || null,
        "login_failed",
        "user",
        user?.id || null,
        null,
        null,
        req,
      );
      return json(res, 401, { error: "Email hoặc mật khẩu không đúng." });
    }
    if (user.status !== "active")
      return json(res, 403, {
        error: "Tài khoản chưa được kích hoạt hoặc đã bị khóa.",
      });
    const token = createSessionToken();
    await pool.execute("DELETE FROM auth_attempts WHERE email_hash=?", [
      emailKey,
    ]);
    await audit(user.id, "login_success", "user", user.id, null, null, req);
    await pool.execute("DELETE FROM auth_sessions WHERE expires_at <= NOW()");
    await pool.execute(
      "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))",
      [tokenHash(token), user.id, sessionHours],
    );
    await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [
      user.id,
    ]);
    return json(
      res,
      200,
      {
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
          loyalty_points: user.loyalty_points,
        },
      },
      {
        "Set-Cookie": `n01_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionHours * 3600}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      },
    );
  }
  if (req.method === "POST" && path === "/api/auth/logout") {
    const token = parseCookies(req).n01_session;
    if (token)
      await pool.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [
        tokenHash(token),
      ]);
    return json(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": "n01_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      },
    );
  }
  if (req.method === "GET" && path === "/api/auth/me")
    return json(res, 200, { user: await currentUser(req) });
  if (req.method === "PATCH" && path === "/api/profile") {
    const user = await requireUser(req, res);
    if (!user) return true;
    const { full_name, phone } = await readBody(req);
    if (String(full_name || "").trim().length < 2)
      return json(res, 400, { error: "Họ tên không hợp lệ." });
    text(full_name, "Họ tên", 150, 2);
    text(phone || "", "Điện thoại", 20, 0);
    await pool.execute(
      "UPDATE users SET full_name = ?, phone = ? WHERE id = ?",
      [String(full_name).trim(), String(phone || "").trim() || null, user.id],
    );
    await audit(
      user.id,
      "update_profile",
      "user",
      user.id,
      null,
      { full_name, phone },
      req,
    );
    return json(res, 200, { user: await currentUser(req) });
  }
  return false;
}

async function handleCustomer(req, res, url) {
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/notifications") {
    const user = await requireUser(req, res);
    if (!user) return true;
    return json(res, 200, {
      notifications: await all(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
        [user.id],
      ),
    });
  }
  const favoriteMatch = path.match(/^\/api\/venues\/(\d+)\/favorite$/);
  if (req.method === "POST" && favoriteMatch) {
    const user = await requireUser(req, res, ["customer", "coach"]);
    if (!user) return true;
    const venueId = Number(favoriteMatch[1]);
    const existing = await one(
      "SELECT 1 FROM favorites WHERE user_id = ? AND venue_id = ?",
      [user.id, venueId],
    );
    if (existing)
      await pool.execute(
        "DELETE FROM favorites WHERE user_id = ? AND venue_id = ?",
        [user.id, venueId],
      );
    else
      await pool.execute(
        "INSERT INTO favorites (user_id, venue_id) VALUES (?, ?)",
        [user.id, venueId],
      );
    return json(res, 200, { favorite: !existing });
  }
  if (req.method === "POST" && path === "/api/bookings") {
    const user = await requireUser(req, res, ["customer", "coach"]);
    if (!user) return true;
    const body = await readBody(req);
    const courtId = Number(body.court_id);
    const startAt = inputDate(body.start_at);
    const endAt = inputDate(body.end_at);
    if (
      !courtId ||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(startAt) ||
      startAt >= endAt
    )
      return json(res, 400, { error: "Thông tin khung giờ không hợp lệ." });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const court = await one(
        `SELECT c.*, v.owner_id, v.status AS venue_status FROM courts c JOIN venues v ON v.id = c.venue_id WHERE c.id = ? FOR UPDATE`,
        [courtId],
        connection,
      );
      if (
        !court ||
        court.status !== "active" ||
        court.venue_status !== "active"
      )
        throw Object.assign(
          new Error("Sân không tồn tại hoặc đang ngừng hoạt động."),
          { status: 404 },
        );
      const conflict = await one(
        `SELECT id FROM bookings WHERE court_id = ?
        AND ((status IN ('confirmed','checked_in')) OR (status = 'pending' AND hold_expires_at > NOW()))
        AND start_at < ? AND end_at > ? LIMIT 1 FOR UPDATE`,
        [courtId, endAt, startAt],
        connection,
      );
      const blocked = await one(
        `SELECT id FROM maintenance_blocks WHERE court_id = ? AND active = TRUE AND start_at < ? AND end_at > ? LIMIT 1 FOR UPDATE`,
        [courtId, endAt, startAt],
        connection,
      );
      if (conflict || blocked)
        throw Object.assign(
          new Error(
            "Khung giờ vừa được đặt hoặc bị chặn bảo trì. Vui lòng chọn giờ khác.",
          ),
          { status: 409 },
        );
      const subtotal = await moneyRule(courtId, startAt, connection);
      const promotion = await applyPromotion(
        String(body.promotion_code || "")
          .trim()
          .toUpperCase(),
        subtotal,
        user.id,
        courtId,
        connection,
      );
      const code = bookingCode();
      const [result] = await connection.execute(
        `INSERT INTO bookings
        (booking_code, user_id, court_id, promotion_id, start_at, end_at, hold_expires_at, subtotal, discount_amount, total_amount, note)
        VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?, ?, ?)`,
        [
          code,
          user.id,
          courtId,
          promotion.promotionId,
          startAt,
          endAt,
          holdMinutes,
          subtotal,
          promotion.discount,
          subtotal - promotion.discount,
          String(body.note || "").slice(0, 500),
        ],
      );
      const bookingId = result.insertId;
      const qr = `N01SPORT|${code}|${subtotal - promotion.discount}`;
      await connection.execute(
        "INSERT INTO payments (booking_id, provider, amount, status, qr_content) VALUES (?, 'demo', ?, 'pending', ?)",
        [bookingId, subtotal - promotion.discount, qr],
      );
      if (promotion.promotionId)
        await connection.execute(
          "INSERT INTO promotion_uses (promotion_id, booking_id, user_id) VALUES (?, ?, ?)",
          [promotion.promotionId, bookingId, user.id],
        );
      await notify(
        user.id,
        "booking_created",
        "Đã giữ chỗ",
        `Booking ${code} được giữ trong ${holdMinutes} phút.`,
        "booking",
        bookingId,
        connection,
      );
      await audit(
        user.id,
        "create_booking",
        "booking",
        bookingId,
        null,
        { code, court_id: courtId, start_at: startAt },
        req,
        connection,
      );
      await connection.commit();
      return json(res, 201, { booking: await bookingDetail(bookingId) });
    } catch (error) {
      await connection.rollback();
      return json(res, error.status || 500, {
        error: error.message || "Không thể tạo booking.",
      });
    } finally {
      connection.release();
    }
  }
  if (req.method === "GET" && path === "/api/bookings") {
    const user = await requireUser(req, res);
    if (!user) return true;
    await expireHolds();
    const rows = await all(
      `SELECT b.*, c.name AS court_name, s.name AS sport_name, v.name AS venue_name, v.address,
      p.status AS payment_status, p.provider AS payment_provider, p.qr_content
      FROM bookings b JOIN courts c ON c.id = b.court_id JOIN sports s ON s.id = c.sport_id
      JOIN venues v ON v.id = c.venue_id LEFT JOIN users u ON u.id=b.user_id LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.user_id = ? ORDER BY b.start_at DESC`,
      [user.id],
    );
    return json(res, 200, { bookings: rows });
  }
  const payMatch = path.match(/^\/api\/bookings\/(\d+)\/pay$/);
  if (req.method === "POST" && payMatch) {
    const user = await requireUser(req, res, ["customer", "coach"]);
    if (!user) return true;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const booking = await one(
        "SELECT *, hold_expires_at > NOW() AS active_hold FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE",
        [Number(payMatch[1]), user.id],
        connection,
      );
      if (!booking)
        throw Object.assign(new Error("Không tìm thấy booking."), {
          status: 404,
        });
      if (booking.status !== "pending" || !booking.active_hold)
        throw Object.assign(new Error("Booking đã hết hạn giữ chỗ."), {
          status: 409,
        });
      const ref = `DEMO-${Date.now()}`;
      await connection.execute(
        "UPDATE payments SET status = 'paid', paid_at = NOW(), transaction_ref = ? WHERE booking_id = ? AND status = 'pending'",
        [ref, booking.id],
      );
      await connection.execute(
        "UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = ?",
        [booking.id],
      );
      await notify(
        user.id,
        "payment_success",
        "Thanh toán thành công",
        `Booking ${booking.booking_code} đã được xác nhận.`,
        "booking",
        booking.id,
        connection,
      );
      await audit(
        user.id,
        "pay_booking",
        "booking",
        booking.id,
        null,
        { transaction_ref: ref },
        req,
        connection,
      );
      await connection.commit();
      return json(res, 200, { booking: await bookingDetail(booking.id) });
    } catch (error) {
      await connection.rollback();
      return json(res, error.status || 500, { error: error.message });
    } finally {
      connection.release();
    }
  }
  const cancelMatch = path.match(/^\/api\/bookings\/(\d+)\/cancel$/);
  if (req.method === "POST" && cancelMatch) {
    const user = await requireUser(req, res, ["customer", "coach"]);
    if (!user) return true;
    const { reason } = await readBody(req);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const booking = await one(
        "SELECT b.*, p.status AS payment_status FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id WHERE b.id = ? AND b.user_id = ? FOR UPDATE",
        [Number(cancelMatch[1]), user.id],
        connection,
      );
      if (!booking || !["pending", "confirmed"].includes(booking.status))
        throw Object.assign(new Error("Booking không thể gửi yêu cầu hủy."), {
          status: 409,
        });
      if (
        new Date(String(booking.start_at).replace(" ", "T") + "+07:00") <=
        new Date()
      )
        throw Object.assign(
          new Error("Không thể hủy khi giờ sử dụng đã bắt đầu."),
          { status: 409 },
        );
      const activeOrder = await one(
        "SELECT id FROM service_orders WHERE booking_id=? AND status<>'cancelled' LIMIT 1 FOR UPDATE",
        [booking.id],
        connection,
      );
      if (activeOrder)
        throw Object.assign(
          new Error("Booking đã có đơn dịch vụ; liên hệ cơ sở để xử lý."),
          { status: 409 },
        );
      if (booking.status === "pending" && booking.payment_status !== "paid") {
        await connection.execute(
          "UPDATE bookings SET status = 'cancelled', cancelled_reason = ? WHERE id = ?",
          [String(reason || "Khách hủy khi chưa thanh toán"), booking.id],
        );
        await connection.execute(
          "UPDATE payments SET status = 'failed' WHERE booking_id = ? AND status = 'pending'",
          [booking.id],
        );
      } else {
        await connection.execute(
          "UPDATE bookings SET status = 'cancel_requested', cancelled_reason = ? WHERE id = ?",
          [String(reason || "Khách gửi yêu cầu hủy"), booking.id],
        );
        await connection.execute(
          `INSERT INTO refund_requests (booking_id, requested_by, reason, requested_amount)
          VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
          [
            booking.id,
            user.id,
            String(reason || "Khách gửi yêu cầu hủy"),
            booking.total_amount,
          ],
        );
      }
      await audit(
        user.id,
        "request_cancel",
        "booking",
        booking.id,
        { status: booking.status },
        { reason },
        req,
        connection,
      );
      await connection.commit();
      return json(res, 200, { booking: await bookingDetail(booking.id) });
    } catch (error) {
      await connection.rollback();
      return json(res, error.status || 500, { error: error.message });
    } finally {
      connection.release();
    }
  }
  const reviewMatch = path.match(/^\/api\/bookings\/(\d+)\/review$/);
  if (req.method === "POST" && reviewMatch) {
    const user = await requireUser(req, res, ["customer", "coach"]);
    if (!user) return true;
    const { rating, comment } = await readBody(req);
    const booking = await one(
      `SELECT b.id, v.id AS venue_id FROM bookings b JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id
      WHERE b.id=? AND b.user_id=? AND b.status='completed'`,
      [Number(reviewMatch[1]), user.id],
    );
    if (!booking)
      return json(res, 409, {
        error: "Chỉ có thể đánh giá booking đã hoàn tất.",
      });
    integer(rating, "Điểm đánh giá", 1, 5);
    await pool.execute(
      `INSERT INTO reviews (booking_id,user_id,venue_id,rating,comment) VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE rating=VALUES(rating), comment=VALUES(comment)`,
      [
        booking.id,
        user.id,
        booking.venue_id,
        Number(rating),
        String(comment || "").slice(0, 1000),
      ],
    );
    await pool.execute(
      `UPDATE venues v SET rating=(SELECT AVG(r.rating) FROM reviews r WHERE r.venue_id=v.id AND r.status='visible'),
      review_count=(SELECT COUNT(*) FROM reviews r WHERE r.venue_id=v.id AND r.status='visible') WHERE v.id=?`,
      [booking.venue_id],
    );
    return json(res, 200, { ok: true });
  }
  return false;
}

async function handleOwner(req, res, url) {
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/owner/dashboard") {
    const user = await requireUser(req, res, ["owner", "admin"]);
    if (!user) return true;
    const ownerId =
      user.role === "admin"
        ? Number(url.searchParams.get("owner_id") || 2)
        : user.id;
    const [
      metrics,
      recent,
      courts,
      promotions,
      staff,
      services,
      maintenance,
      refunds,
    ] = await Promise.all([
      one(
        `SELECT COUNT(DISTINCT c.id) AS courts, COUNT(DISTINCT CASE WHEN b.start_at>=NOW() THEN b.id END) AS upcoming_bookings,
        COALESCE(SUM(CASE WHEN p.status='paid' THEN p.amount ELSE 0 END),0) AS collected,
        COUNT(DISTINCT CASE WHEN b.status='confirmed' THEN b.id END) AS confirmed
        FROM venues v LEFT JOIN courts c ON c.venue_id=v.id LEFT JOIN bookings b ON b.court_id=c.id LEFT JOIN payments p ON p.booking_id=b.id WHERE v.owner_id=?`,
        [ownerId],
      ),
      all(
        `SELECT b.id,b.booking_code,b.start_at,b.status,b.total_amount,c.name AS court_name,v.name AS venue_name,COALESCE(b.guest_name,u.full_name) AS full_name
        FROM bookings b JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id LEFT JOIN users u ON u.id=b.user_id
        WHERE v.owner_id=? ORDER BY b.created_at DESC LIMIT 12`,
        [ownerId],
      ),
      all(
        `SELECT c.id,c.name,c.surface,c.base_price,c.status,c.current_state,c.venue_id,v.name AS venue_name,s.name AS sport_name,COUNT(b.id) AS booking_count
        FROM courts c JOIN venues v ON v.id=c.venue_id JOIN sports s ON s.id=c.sport_id LEFT JOIN bookings b ON b.court_id=c.id
        WHERE v.owner_id=? GROUP BY c.id ORDER BY c.id`,
        [ownerId],
      ),
      all(
        "SELECT p.* FROM promotions p WHERE p.owner_id=? ORDER BY p.created_at DESC",
        [ownerId],
      ),
      all(
        `SELECT u.id,u.full_name,u.email,u.phone,u.role,u.status,sa.position,v.name AS venue_name FROM staff_assignments sa
        JOIN users u ON u.id=sa.staff_id JOIN venues v ON v.id=sa.venue_id WHERE v.owner_id=?`,
        [ownerId],
      ),
      all(
        `SELECT s.* ,v.name AS venue_name FROM services s JOIN venues v ON v.id=s.venue_id WHERE v.owner_id=? ORDER BY s.id DESC`,
        [ownerId],
      ),
      all(
        `SELECT mr.*,c.name AS court_name,u.full_name AS assigned_name FROM maintenance_requests mr JOIN courts c ON c.id=mr.court_id
        JOIN venues v ON v.id=c.venue_id LEFT JOIN users u ON u.id=mr.assigned_to WHERE v.owner_id=? ORDER BY mr.created_at DESC LIMIT 20`,
        [ownerId],
      ),
      all(
        `SELECT rr.*,b.booking_code,u.full_name FROM refund_requests rr JOIN bookings b ON b.id=rr.booking_id JOIN courts c ON c.id=b.court_id
        JOIN venues v ON v.id=c.venue_id JOIN users u ON u.id=rr.requested_by WHERE v.owner_id=? ORDER BY rr.created_at DESC`,
        [ownerId],
      ),
    ]);
    return json(res, 200, {
      metrics,
      recent,
      courts,
      promotions,
      staff,
      services,
      maintenance,
      refunds,
    });
  }
  if (req.method === "POST" && path === "/api/owner/courts") {
    const user = await requireUser(req, res, ["owner"]);
    if (!user) return true;
    const body = await readBody(req);
    const venue = await one("SELECT id FROM venues WHERE id=? AND owner_id=?", [
      Number(body.venue_id),
      user.id,
    ]);
    if (!venue)
      return json(res, 403, { error: "Địa điểm không thuộc quyền quản lý." });
    const [result] = await pool.execute(
      `INSERT INTO courts (venue_id,sport_id,name,surface,capacity,indoor,base_price,slot_minutes)
      VALUES (?,?,?,?,?,?,?,?)`,
      [
        venue.id,
        Number(body.sport_id),
        String(body.name || "").trim(),
        String(body.surface || "").trim(),
        Number(body.capacity || 10),
        Boolean(body.indoor),
        Number(body.base_price),
        Number(body.slot_minutes || 60),
      ],
    );
    await audit(
      user.id,
      "create_court",
      "court",
      result.insertId,
      null,
      body,
      req,
    );
    return json(res, 201, { id: result.insertId });
  }
  const courtMatch = path.match(/^\/api\/owner\/courts\/(\d+)$/);
  if (req.method === "PATCH" && courtMatch) {
    const user = await requireUser(req, res, ["owner"]);
    if (!user) return true;
    const body = await readBody(req);
    const court = await one(
      "SELECT c.* FROM courts c JOIN venues v ON v.id=c.venue_id WHERE c.id=? AND v.owner_id=?",
      [Number(courtMatch[1]), user.id],
    );
    if (!court) return json(res, 404, { error: "Không tìm thấy sân." });
    const status = ["active", "maintenance", "inactive"].includes(body.status)
      ? body.status
      : court.status;
    await pool.execute(
      "UPDATE courts SET name=?,surface=?,base_price=?,status=? WHERE id=?",
      [
        String(body.name || court.name),
        String(body.surface || court.surface),
        Number(body.base_price || court.base_price),
        status,
        court.id,
      ],
    );
    await audit(user.id, "update_court", "court", court.id, court, body, req);
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && path === "/api/owner/promotions") {
    const user = await requireUser(req, res, ["owner"]);
    if (!user) return true;
    const b = await readBody(req);
    try {
      const [result] = await pool.execute(
        `INSERT INTO promotions (owner_id,venue_id,code,name,discount_type,discount_value,min_order_value,max_discount,usage_limit,starts_at,ends_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          user.id,
          b.venue_id || null,
          String(b.code || "").toUpperCase(),
          b.name,
          b.discount_type,
          Number(b.discount_value),
          Number(b.min_order_value || 0),
          b.max_discount || null,
          b.usage_limit || null,
          inputDate(b.starts_at),
          inputDate(b.ends_at),
        ],
      );
      await audit(
        user.id,
        "create_promotion",
        "promotion",
        result.insertId,
        null,
        b,
        req,
      );
      return json(res, 201, { id: result.insertId });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY")
        return json(res, 409, { error: "Mã khuyến mãi đã tồn tại." });
      throw error;
    }
  }
  if (req.method === "POST" && path === "/api/owner/services") {
    const user = await requireUser(req, res, ["owner"]);
    if (!user) return true;
    const b = await readBody(req);
    const venue = await one("SELECT id FROM venues WHERE id=? AND owner_id=?", [
      Number(b.venue_id),
      user.id,
    ]);
    if (!venue)
      return json(res, 403, { error: "Địa điểm không thuộc quyền quản lý." });
    const [result] = await pool.execute(
      "INSERT INTO services (venue_id,name,type,unit,price,stock_quantity) VALUES (?,?,?,?,?,?)",
      [
        venue.id,
        b.name,
        b.type,
        b.unit,
        Number(b.price),
        Number(b.stock_quantity || 0),
      ],
    );
    await audit(
      user.id,
      "create_service",
      "service",
      result.insertId,
      null,
      b,
      req,
    );
    return json(res, 201, { id: result.insertId });
  }
  if (req.method === "POST" && path === "/api/owner/staff") {
    const user = await requireUser(req, res, ["owner"]);
    if (!user) return true;
    const b = await readBody(req);
    if (String(b.password || "").length < 8)
      return json(res, 400, {
        error: "Mật khẩu nhân viên cần ít nhất 8 ký tự.",
      });
    if (!/^\S+@\S+\.\S+$/.test(String(b.email || "")))
      return json(res, 400, { error: "Email nhân viên không hợp lệ." });
    const venue = await one("SELECT id FROM venues WHERE id=? AND owner_id=?", [
      Number(b.venue_id),
      user.id,
    ]);
    if (!venue)
      return json(res, 403, { error: "Địa điểm không thuộc quyền quản lý." });
    if (!["receptionist", "technician", "cleaner"].includes(b.position))
      return json(res, 400, { error: "Vị trí nhân viên không hợp lệ." });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [created] = await connection.execute(
        `INSERT INTO users (full_name,email,phone,password_hash,role,status) VALUES (?,?,?,?,?,'active')`,
        [
          b.full_name,
          String(b.email).toLowerCase(),
          b.phone || null,
          hashPassword(b.password),
          b.position,
        ],
      );
      await connection.execute(
        `INSERT INTO staff_assignments (staff_id,venue_id,position,shift_start,shift_end,role_note) VALUES (?,?,?,?,?,?)`,
        [
          created.insertId,
          venue.id,
          b.position,
          inputDate(b.shift_start),
          inputDate(b.shift_end),
          b.role_note || null,
        ],
      );
      await audit(
        user.id,
        "create_staff",
        "user",
        created.insertId,
        null,
        { email: b.email, position: b.position, venue_id: venue.id },
        req,
        connection,
      );
      await connection.commit();
      return json(res, 201, { id: created.insertId });
    } catch (error) {
      await connection.rollback();
      if (error.code === "ER_DUP_ENTRY")
        return json(res, 409, {
          error: "Email hoặc số điện thoại đã tồn tại.",
        });
      throw error;
    } finally {
      connection.release();
    }
  }
  const maintenanceMatch = path.match(/^\/api\/owner\/maintenance\/(\d+)$/);
  if (req.method === "PATCH" && maintenanceMatch) {
    const user = await requireUser(req, res, ["owner"]);
    if (!user) return true;
    const b = await readBody(req);
    const request = await one(
      `SELECT mr.* FROM maintenance_requests mr JOIN courts c ON c.id=mr.court_id JOIN venues v ON v.id=c.venue_id
      WHERE mr.id=? AND v.owner_id=?`,
      [Number(maintenanceMatch[1]), user.id],
    );
    if (!request)
      return json(res, 404, { error: "Không tìm thấy yêu cầu bảo trì." });
    const status = [
      "assigned",
      "in_progress",
      "resolved",
      "closed",
      "rejected",
    ].includes(b.status)
      ? b.status
      : request.status;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "UPDATE maintenance_requests SET status=?,assigned_to=COALESCE(?,assigned_to),resolved_at=IF(? IN ('resolved','closed'),NOW(),resolved_at) WHERE id=?",
        [status, b.assigned_to || null, status, request.id],
      );
      if (b.block_start && b.block_end)
        await connection.execute(
          `INSERT INTO maintenance_blocks (court_id,request_id,start_at,end_at,reason,created_by) VALUES (?,?,?,?,?,?)`,
          [
            request.court_id,
            request.id,
            inputDate(b.block_start),
            inputDate(b.block_end),
            b.reason || request.title,
            user.id,
          ],
        );
      await audit(
        user.id,
        "review_maintenance",
        "maintenance_request",
        request.id,
        request,
        b,
        req,
        connection,
      );
      await connection.commit();
      return json(res, 200, { ok: true });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  const refundMatch = path.match(/^\/api\/owner\/refunds\/(\d+)$/);
  if (req.method === "PATCH" && refundMatch) {
    const user = await requireUser(req, res, ["owner"]);
    if (!user) return true;
    const b = await readBody(req);
    if (!["approved", "rejected", "refunded"].includes(b.status))
      return json(res, 400, { error: "Trạng thái xử lý không hợp lệ." });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const refund = await one(
        `SELECT rr.*,b.id AS booking_id,b.user_id FROM refund_requests rr JOIN bookings b ON b.id=rr.booking_id
        JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id WHERE rr.id=? AND v.owner_id=? FOR UPDATE`,
        [Number(refundMatch[1]), user.id],
        connection,
      );
      if (!refund)
        throw Object.assign(new Error("Không tìm thấy yêu cầu hoàn tiền."), {
          status: 404,
        });
      await connection.execute(
        "UPDATE refund_requests SET status=?,approved_amount=?,review_note=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?",
        [
          b.status,
          b.status === "rejected"
            ? 0
            : Number(b.approved_amount || refund.requested_amount),
          b.review_note || null,
          user.id,
          refund.id,
        ],
      );
      if (b.status === "approved") {
        await connection.execute(
          "UPDATE bookings SET status='cancelled' WHERE id=?",
          [refund.booking_id],
        );
        await connection.execute(
          "UPDATE payments SET status='refund_pending' WHERE booking_id=? AND status='paid'",
          [refund.booking_id],
        );
      }
      if (b.status === "refunded")
        await connection.execute(
          "UPDATE payments SET status='refunded' WHERE booking_id=?",
          [refund.booking_id],
        );
      if (b.status === "rejected")
        await connection.execute(
          "UPDATE bookings SET status='confirmed' WHERE id=?",
          [refund.booking_id],
        );
      await notify(
        refund.user_id,
        "refund_review",
        "Kết quả yêu cầu hủy",
        `Yêu cầu hủy được cập nhật: ${b.status}.`,
        "booking",
        refund.booking_id,
        connection,
      );
      await audit(
        user.id,
        "review_refund",
        "refund_request",
        refund.id,
        refund,
        b,
        req,
        connection,
      );
      await connection.commit();
      return json(res, 200, { ok: true });
    } catch (error) {
      await connection.rollback();
      return json(res, error.status || 500, { error: error.message });
    } finally {
      connection.release();
    }
  }
  return false;
}

async function handleStaff(req, res, url) {
  const offlinePath = url.pathname;
  if (req.method === "GET" && offlinePath === "/api/staff/courts") {
    const user = await requireUser(req, res, ["receptionist"]);
    if (!user) return true;
    const courts = await all(`SELECT c.*,v.name AS venue_name,v.address,v.district
      FROM courts c JOIN venues v ON v.id=c.venue_id JOIN sports s ON s.id=c.sport_id
      WHERE c.status='active' AND v.status='active' AND s.status='active' AND EXISTS
      (SELECT 1 FROM staff_assignments sa WHERE sa.staff_id=? AND sa.venue_id=v.id AND sa.position='receptionist' AND sa.active=TRUE)
      ORDER BY v.name,c.name`, [user.id]);
    return json(res, 200, { courts });
  }
  const collect = offlinePath.match(/^\/api\/staff\/bookings\/(\d+)\/pay$/);
  if (req.method === "POST" && (offlinePath === "/api/staff/bookings" || collect)) {
    const user = await requireUser(req, res, ["receptionist"]);
    if (!user) return true;
    const body = await readBody(req);
    const offlineAudit = (actor, action, type, id, oldValues, newValues, connection) =>
      audit(actor, action, type, id, oldValues, newValues, req, connection);
    if (collect) {
      await collectOfflinePayment(pool, user.id, Number(collect[1]), body.payment_method, offlineAudit);
      return json(res, 200, { booking: await bookingDetail(Number(collect[1])) });
    }
    const id = await createOfflineBooking(pool, user.id, body, { moneyRule, audit: offlineAudit });
    return json(res, 201, { booking: await bookingDetail(id) });
  }
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/staff/dashboard") {
    const user = await requireUser(req, res, [
      "receptionist",
      "technician",
      "cleaner",
    ]);
    if (!user) return true;
    const assignments = await all(
      `SELECT sa.*,v.name AS venue_name FROM staff_assignments sa JOIN venues v ON v.id=sa.venue_id WHERE sa.staff_id=? AND sa.active=TRUE`,
      [user.id],
    );
    let work = [];
    if (user.role === "receptionist")
      work = await all(
        `SELECT b.id,b.booking_code,b.start_at,b.end_at,b.status,COALESCE(b.guest_name,u.full_name) AS full_name,COALESCE(b.guest_phone,u.phone) AS phone,b.guest_name,b.total_amount,c.name AS court_name,p.status AS payment_status
      FROM bookings b LEFT JOIN users u ON u.id=b.user_id JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id LEFT JOIN payments p ON p.booking_id=b.id
      WHERE v.id IN (SELECT venue_id FROM staff_assignments WHERE staff_id=? AND active=TRUE) AND DATE(b.start_at)=? ORDER BY b.start_at`,
        [user.id, url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())],
      );
    if (user.role === "technician")
      work = await all(
        `SELECT mr.*,c.name AS court_name,v.name AS venue_name FROM maintenance_requests mr JOIN courts c ON c.id=mr.court_id JOIN venues v ON v.id=c.venue_id
      WHERE (mr.assigned_to=? OR mr.assigned_to IS NULL) AND v.id IN (SELECT venue_id FROM staff_assignments WHERE staff_id=? AND active=TRUE AND position='technician') ORDER BY FIELD(mr.priority,'urgent','high','medium','low'),mr.created_at`,
        [user.id, user.id],
      );
    if (user.role === "cleaner")
      work = await all(
        `SELECT ct.*,c.name AS court_name,v.name AS venue_name FROM cleaning_tasks ct JOIN courts c ON c.id=ct.court_id JOIN venues v ON v.id=c.venue_id
      WHERE (ct.assigned_to=? OR ct.assigned_to IS NULL) AND v.id IN (SELECT venue_id FROM staff_assignments WHERE staff_id=? AND active=TRUE AND position='cleaner') ORDER BY ct.scheduled_at`,
        [user.id, user.id],
      );
    return json(res, 200, { role: user.role, assignments, work });
  }
  const bookingStatus = path.match(/^\/api\/staff\/bookings\/(\d+)\/status$/);
  if (req.method === "PATCH" && bookingStatus) {
    const user = await requireUser(req, res, ["receptionist"]);
    if (!user) return true;
    const { status } = await readBody(req);
    const transitions = {
      confirmed: ["checked_in", "no_show"],
      checked_in: ["completed"],
    };
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const booking = await one(
        `SELECT b.*,v.owner_id FROM bookings b JOIN courts c ON c.id=b.court_id JOIN venues v ON v.id=c.venue_id
      WHERE b.id=? AND v.id IN (SELECT venue_id FROM staff_assignments WHERE staff_id=? AND active=TRUE) FOR UPDATE`,
        [Number(bookingStatus[1]), user.id],
        connection,
      );
      if (!booking || !(transitions[booking.status] || []).includes(status))
        throw Object.assign(
          new Error("Không thể chuyển sang trạng thái này."),
          { status: 409 },
        );
      const begin = new Date(
        booking.start_at.replace(" ", "T") + "+07:00",
      ).getTime();
      if (status === "checked_in" && Date.now() < begin - 30 * 60000)
        fail("Chỉ check-in trong vòng 30 phút trước giờ đặt.", 409);
      if (["no_show", "completed"].includes(status) && Date.now() < begin)
        fail("Chưa đến giờ đặt sân.", 409);
      if (
        status === "completed" &&
        (await one(
          "SELECT o.id FROM service_orders o WHERE o.booking_id=? AND (o.status IN ('pending','paid','delivered')) LIMIT 1",
          [booking.id],
          connection,
        ))
      )
        fail(
          "Cần xử lý đơn dịch vụ và nhận lại dụng cụ trước khi hoàn tất.",
          409,
        );
      if (status === "checked_in") {
        await connection.execute(
          "UPDATE bookings SET status='checked_in',check_in_at=NOW() WHERE id=?",
          [booking.id],
        );
        await connection.execute(
          "UPDATE courts SET current_state='in_use' WHERE id=?",
          [booking.court_id],
        );
      }
      if (status === "no_show")
        await connection.execute(
          "UPDATE bookings SET status='no_show',completed_at=NOW() WHERE id=?",
          [booking.id],
        );
      if (status === "completed") {
        await connection.execute(
          "UPDATE bookings SET status='completed',completed_at=NOW() WHERE id=?",
          [booking.id],
        );
        await connection.execute(
          "UPDATE courts SET current_state='needs_cleaning' WHERE id=?",
          [booking.court_id],
        );
        await connection.execute(
          "INSERT INTO cleaning_tasks (court_id,booking_id,scheduled_at,status) VALUES (?,?,NOW(),'pending')",
          [booking.court_id, booking.id],
        );
        if (booking.user_id) {
          const rule = await one(
            "SELECT lr.points_per_amount FROM loyalty_rules lr JOIN venues v ON v.owner_id=lr.owner_id JOIN courts c ON c.venue_id=v.id WHERE c.id=? AND lr.active=TRUE LIMIT 1",
            [booking.court_id],
            connection,
          );
          const points = Math.floor(
            booking.total_amount / Number(rule?.points_per_amount || 10000),
          );
          await connection.execute(
            `INSERT IGNORE INTO loyalty_transactions (user_id,booking_id,points,reason) VALUES (?,?,?,'Hoàn tất booking')`,
            [booking.user_id, booking.id, points],
          );
          await connection.execute(
            "UPDATE users SET loyalty_points=loyalty_points+? WHERE id=?",
            [points, booking.user_id],
          );
        }
      }
      await audit(
        user.id,
        "staff_booking_status",
        "booking",
        booking.id,
        { status: booking.status },
        { status },
        req,
        connection,
      );
      await connection.commit();
      return json(res, 200, { ok: true });
    } catch (error) {
      await connection.rollback();
      return json(res, error.status || 500, { error: error.message });
    } finally {
      connection.release();
    }
  }
  const maintenanceTask = path.match(/^\/api\/staff\/maintenance\/(\d+)$/);
  if (req.method === "PATCH" && maintenanceTask) {
    const user = await requireUser(req, res, ["technician"]);
    if (!user) return true;
    const b = await readBody(req);
    if (
      !["assigned", "in_progress", "waiting_approval", "resolved"].includes(
        b.status,
      )
    )
      return json(res, 400, { error: "Trạng thái không hợp lệ." });
    await pool.execute(
      "UPDATE maintenance_requests SET assigned_to=?,status=?,resolved_at=IF(?='resolved',NOW(),resolved_at) WHERE id=?",
      [user.id, b.status, b.status, Number(maintenanceTask[1])],
    );
    return json(res, 200, { ok: true });
  }
  const cleaningTask = path.match(/^\/api\/staff\/cleaning\/(\d+)$/);
  if (req.method === "PATCH" && cleaningTask) {
    const user = await requireUser(req, res, ["cleaner"]);
    if (!user) return true;
    const b = await readBody(req);
    if (!["assigned", "in_progress", "completed", "blocked"].includes(b.status))
      return json(res, 400, { error: "Trạng thái không hợp lệ." });
    const task = await one("SELECT * FROM cleaning_tasks WHERE id=?", [
      Number(cleaningTask[1]),
    ]);
    if (!task) return json(res, 404, { error: "Không tìm thấy nhiệm vụ." });
    await pool.execute(
      `UPDATE cleaning_tasks SET assigned_to=?,status=?,started_at=IF(?='in_progress',NOW(),started_at),completed_at=IF(?='completed',NOW(),completed_at),issue_note=? WHERE id=?`,
      [user.id, b.status, b.status, b.status, b.issue_note || null, task.id],
    );
    if (b.status === "completed")
      await pool.execute("UPDATE courts SET current_state='ready' WHERE id=?", [
        task.court_id,
      ]);
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && path === "/api/staff/maintenance") {
    const user = await requireUser(req, res, ["receptionist", "technician"]);
    if (!user) return true;
    const b = await readBody(req);
    const [result] = await pool.execute(
      `INSERT INTO maintenance_requests (court_id,reported_by,assigned_to,title,description,priority,status) VALUES (?,?,?,?,?,?,?)`,
      [
        Number(b.court_id),
        user.id,
        user.role === "technician" ? user.id : null,
        b.title,
        b.description,
        b.priority || "medium",
        user.role === "technician" ? "assigned" : "open",
      ],
    );
    return json(res, 201, { id: result.insertId });
  }
  return false;
}

async function handleAdmin(req, res, url) {
  const path = url.pathname;
  if (req.method === "GET" && path === "/api/admin/dashboard") {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return true;
    const [metrics, users, venues, auditRows] = await Promise.all([
      one(`SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM venues) AS venues,(SELECT COUNT(*) FROM courts) AS courts,
      (SELECT COUNT(*) FROM bookings) AS bookings,(SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid') AS collected`),
      all(
        "SELECT id,full_name,email,phone,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 50",
      ),
      all(
        `SELECT v.id,v.name,v.district,v.city,v.status,v.rating,v.review_count,u.full_name AS owner_name FROM venues v JOIN users u ON u.id=v.owner_id ORDER BY v.id DESC`,
      ),
      all(
        `SELECT al.*,u.full_name AS actor_name FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_id ORDER BY al.created_at DESC LIMIT 30`,
      ),
    ]);
    return json(res, 200, { metrics, users, venues, audit: auditRows });
  }
  const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (req.method === "PATCH" && userMatch) {
    const admin = await requireUser(req, res, ["admin"]);
    if (!admin) return true;
    const b = await readBody(req);
    const target = await one("SELECT id,role,status FROM users WHERE id=?", [
      Number(userMatch[1]),
    ]);
    if (!target) return json(res, 404, { error: "Không tìm thấy tài khoản." });
    const role = [
      "customer",
      "coach",
      "owner",
      "receptionist",
      "technician",
      "cleaner",
      "admin",
    ].includes(b.role)
      ? b.role
      : target.role;
    const status = ["active", "locked", "pending"].includes(b.status)
      ? b.status
      : target.status;
    await pool.execute("UPDATE users SET role=?,status=? WHERE id=?", [
      role,
      status,
      target.id,
    ]);
    if (status !== "active")
      await pool.execute("DELETE FROM auth_sessions WHERE user_id=?", [
        target.id,
      ]);
    await audit(
      admin.id,
      "admin_update_user",
      "user",
      target.id,
      target,
      { role, status },
      req,
    );
    return json(res, 200, { ok: true });
  }
  const venueMatch = path.match(/^\/api\/admin\/venues\/(\d+)$/);
  if (req.method === "PATCH" && venueMatch) {
    const admin = await requireUser(req, res, ["admin"]);
    if (!admin) return true;
    const { status } = await readBody(req);
    if (!["active", "pending", "suspended"].includes(status))
      return json(res, 400, { error: "Trạng thái địa điểm không hợp lệ." });
    const venue = await one("SELECT * FROM venues WHERE id=?", [
      Number(venueMatch[1]),
    ]);
    if (!venue) return json(res, 404, { error: "Không tìm thấy địa điểm." });
    await pool.execute("UPDATE venues SET status=? WHERE id=?", [
      status,
      venue.id,
    ]);
    await audit(
      admin.id,
      "admin_update_venue",
      "venue",
      venue.id,
      { status: venue.status },
      { status },
      req,
    );
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && path === "/api/admin/users") {
    const admin = await requireUser(req, res, ["admin"]);
    if (!admin) return true;
    const b = await readBody(req);
    if (
      ![
        "customer",
        "coach",
        "owner",
        "receptionist",
        "technician",
        "cleaner",
        "admin",
      ].includes(b.role)
    )
      return json(res, 400, { error: "Vai trò không hợp lệ." });
    if (String(b.password || "").length < 8)
      return json(res, 400, { error: "Mật khẩu cần ít nhất 8 ký tự." });
    if (!/^\S+@\S+\.\S+$/.test(String(b.email || "")))
      return json(res, 400, { error: "Email không hợp lệ." });
    try {
      const [result] = await pool.execute(
        `INSERT INTO users (full_name,email,phone,password_hash,role,status) VALUES (?,?,?,?,?,'active')`,
        [
          b.full_name,
          String(b.email).toLowerCase(),
          b.phone || null,
          hashPassword(b.password),
          b.role,
        ],
      );
      await audit(
        admin.id,
        "admin_create_user",
        "user",
        result.insertId,
        null,
        { email: b.email, role: b.role },
        req,
      );
      return json(res, 201, { id: result.insertId });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY")
        return json(res, 409, {
          error: "Email hoặc số điện thoại đã tồn tại.",
        });
      throw error;
    }
  }
  if (req.method === "POST" && path === "/api/admin/backups") {
    const admin = await requireUser(req, res, ["admin"]);
    if (!admin) return true;
    const [result] = await pool.execute(
      "INSERT INTO backup_jobs (requested_by,status) VALUES (?,'queued')",
      [admin.id],
    );
    await audit(
      admin.id,
      "queue_backup",
      "backup_job",
      result.insertId,
      null,
      { status: "queued" },
      req,
    );
    return json(res, 202, {
      id: result.insertId,
      message:
        "Đã tạo yêu cầu. Cần cấu hình tiến trình mysqldump trên máy chủ để thực thi.",
    });
  }
  return false;
}

const handleFeatures = featureHandler({
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
  moneyRule,
  applyPromotion,
});
async function handleApi(req, res, url) {
  if ((await handleFeatures(req, res, url)) !== false) return;
  if ((await handlePublic(req, res, url)) !== false) return;
  if ((await handleAuth(req, res, url)) !== false) return;
  if ((await handleCustomer(req, res, url)) !== false) return;
  if ((await handleOwner(req, res, url)) !== false) return;
  if ((await handleStaff(req, res, url)) !== false) return;
  if ((await handleAdmin(req, res, url)) !== false) return;
  json(res, 404, { error: "API không tồn tại." });
}

export const server = createServer(async (req, res) => {
  securityHeaders(res);
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || `${host}:${port}`}`,
    );
    rateLimit(req, url.pathname);
    guardRequest(req, url.pathname, parseCookies(req));
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else serveStatic(res, url);
  } catch (error) {
    console.error("Request failed:", error.code || error.status || "INTERNAL");
    if (!res.headersSent) {
      const status =
        error.status ||
        (error.code === "ECONNREFUSED"
          ? 503
          : error.code === "ER_DUP_ENTRY"
            ? 409
            : 500);
      if (status >= 500)
        pool
          .execute("INSERT INTO system_errors(error_code,path) VALUES(?,?)", [
            String(error.code || "INTERNAL").slice(0, 100),
            String(req.url).split("?")[0].slice(0, 255),
          ])
          .catch(() => {});
      json(res, status, {
        error:
          status === 503
            ? "Dịch vụ tạm thời không sẵn sàng."
            : status === 409 && error.code === "ER_DUP_ENTRY"
              ? "Thông tin đã tồn tại."
              : status >= 500
                ? "Lỗi máy chủ. Vui lòng thử lại sau."
                : error.message || "Yêu cầu không hợp lệ.",
      });
    } else res.end();
  }
});

if (process.env.NODE_ENV !== "test") {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.PUBLIC_URL?.startsWith("https://") ||
      process.env.PAYMENT_MODE === "demo" ||
      !process.env.DB_PASSWORD ||
      process.env.DB_PASSWORD === "N01Sport@123")
  )
    throw new Error(
      "Production cần PUBLIC_URL HTTPS, mật khẩu database riêng và tắt thanh toán demo.",
    );
  try {
    await pingDatabase();
    if (process.env.NODE_ENV === "production") await productionChecks(pool);
    server.listen(port, host, () =>
      console.log(`N01SPORT MySQL running at http://${host}:${port}`),
    );
  } catch (error) {
    console.error("Không thể kết nối MySQL:", error.message);
    console.error(
      "Kiểm tra MySQL và .env; cài mới dùng db:init, nâng cấp dùng db:migrate.",
    );
    process.exit(1);
  }
}

server.requestTimeout = 30000;
server.headersTimeout = 10000;
const shutdown = () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
