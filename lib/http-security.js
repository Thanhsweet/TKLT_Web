import { timingSafeEqual } from "node:crypto";
import { tokenHash } from "./security.js";
import { fail } from "./validation.js";
const counts = new Map();
export function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")),
    y = Buffer.from(String(b || ""));
  return x.length === y.length && timingSafeEqual(x, y);
}
export function csrfFor(token) {
  return tokenHash("csrf:" + String(token || ""));
}
export function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (process.env.NODE_ENV === "production")
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
}
export function guardRequest(req, path, cookie) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return;
  if (path === "/api/webhooks/sepay") return;
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    fail("Cần gửi JSON.", 415);
  const origin = req.headers.origin,
    expected = process.env.PUBLIC_URL || `http://${req.headers.host}`;
  if (origin && origin !== new URL(expected).origin)
    fail("Nguồn yêu cầu không hợp lệ.", 403);
  if (
    !path.startsWith("/api/auth/") &&
    cookie.n01_session &&
    !safeEqual(req.headers["x-csrf-token"], csrfFor(cookie.n01_session))
  )
    fail("Phiên thao tác không hợp lệ. Tải lại trang.", 403);
}
export function rateLimit(req, path) {
  if (path === "/api/health" || path === "/api/webhooks/sepay") return;
  const now = Date.now(),
    ip = req.socket.remoteAddress || "unknown";
  const address =
    process.env.TRUST_PROXY === "1"
      ? String(req.headers["x-forwarded-for"] || ip)
          .split(",")
          .pop()
          .trim()
      : ip;
  const auth = path.startsWith("/api/auth/") && req.method === "POST";
  const key = address + (auth ? ":auth" : ":api"),
    max = auth ? 20 : 400;
  let entry = counts.get(key);
  if (!entry || entry.until < now) entry = { count: 0, until: now + 60000 };
  if (++entry.count > max)
    fail("Quá nhiều yêu cầu. Thử lại sau một phút.", 429);
  counts.set(key, entry);
  if (counts.size > 10000)
    for (const [k, v] of counts) if (v.until < now) counts.delete(k);
}
