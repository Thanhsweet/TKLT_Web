import { bookingCode } from "./security.js";
import { fail, integer, validateSlot } from "./validation.js";
export async function createBookings(user, body, req, ctx, series = false) {
  const { pool, one, moneyRule, applyPromotion, notify, audit } = ctx;
  const courtId = integer(body.court_id, "Sân", 1),
    weeks = series ? integer(body.weeks, "Số tuần", 2, 12) : 1;
  const first = String(body.start_at || "")
      .replace("T", " ")
      .slice(0, 19),
    last = String(body.end_at || "")
      .replace("T", " ")
      .slice(0, 19);
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const court = await one(
      `SELECT ct.*,v.owner_id,v.status AS venue_status,v.open_time,v.close_time
      FROM courts ct JOIN venues v ON v.id=ct.venue_id WHERE ct.id=? FOR UPDATE`,
      [courtId],
      c,
    );
    if (!court || court.status !== "active" || court.venue_status !== "active")
      fail("Sân không hoạt động.", 409);
    const bank = await one(
      "SELECT venue_id FROM venue_payment_settings WHERE venue_id=?",
      [court.venue_id],
      c,
    );
    const demo =
      process.env.PAYMENT_MODE === "demo" &&
      process.env.NODE_ENV !== "production";
    if (!demo && !bank)
      fail("Cơ sở chưa cấu hình thanh toán. Vui lòng liên hệ chủ sân.", 409);
    const created = [];
    let seriesId = null;
    if (series) {
      const [r] = await c.execute(
        "INSERT INTO booking_series(series_code,coach_id,repeat_rule) VALUES(?,?,?)",
        [
          bookingCode(),
          user.id,
          JSON.stringify({ weeks, first, last, court_id: courtId }),
        ],
      );
      seriesId = r.insertId;
    }
    for (let i = 0; i < weeks; i++) {
      const shift = (s) => {
        const d = new Date(s.replace(" ", "T") + "+07:00");
        return new Date(d.getTime() + i * 7 * 86400000 + 7 * 3600000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      };
      const [start, end] = validateSlot(
        court,
        i ? shift(first) : first,
        i ? shift(last) : last,
      );
      const conflict = await one(
        `SELECT id FROM bookings WHERE court_id=? AND (status IN ('confirmed','checked_in','cancel_requested') OR (status='pending' AND hold_expires_at>NOW())) AND start_at<? AND end_at>? LIMIT 1 FOR UPDATE`,
        [courtId, end, start],
        c,
      );
      const block = await one(
        "SELECT id FROM maintenance_blocks WHERE court_id=? AND active=TRUE AND start_at<? AND end_at>? LIMIT 1 FOR UPDATE",
        [courtId, end, start],
        c,
      );
      if (conflict || block)
        fail(`Khung giờ ${start} đã đặt hoặc bị chặn.`, 409);
      const subtotal = await moneyRule(courtId, start, c);
      const promotion = await applyPromotion(
        String(body.promotion_code || "")
          .trim()
          .toUpperCase(),
        subtotal,
        user.id,
        courtId,
        c,
      );
      const code = bookingCode(),
        total = subtotal - promotion.discount;
      const [r] = await c.execute(
        `INSERT INTO bookings(booking_code,series_id,user_id,court_id,promotion_id,start_at,end_at,hold_expires_at,subtotal,discount_amount,total_amount,note)
        VALUES(?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE),?,?,?,?)`,
        [
          code,
          seriesId,
          user.id,
          courtId,
          promotion.promotionId,
          start,
          end,
          Number(process.env.BOOKING_HOLD_MINUTES || 10),
          subtotal,
          promotion.discount,
          total,
          String(body.note || "").slice(0, 500),
        ],
      );
      await c.execute(
        "INSERT INTO payments(booking_id,provider,amount,status,qr_content) VALUES(?,?,?, ?,?)",
        [
          r.insertId,
          demo ? "demo" : "bank_transfer",
          total,
          total === 0 ? "paid" : "pending",
          code.replaceAll("-", ""),
        ],
      );
      if (total === 0)
        await c.execute(
          "UPDATE bookings SET status='confirmed',hold_expires_at=NULL WHERE id=?",
          [r.insertId],
        );
      if (promotion.promotionId)
        await c.execute(
          "INSERT INTO promotion_uses(promotion_id,booking_id,user_id) VALUES(?,?,?)",
          [promotion.promotionId, r.insertId, user.id],
        );
      if (series)
        await c.execute(
          "INSERT INTO coach_schedules(coach_id,booking_id,class_name,participant_limit,note) VALUES(?,?,?,?,?)",
          [
            user.id,
            r.insertId,
            String(body.class_name || "Lớp thể thao").slice(0, 150),
            integer(body.participant_limit || 1, "Số học viên", 1, 100),
            String(body.note || "").slice(0, 500),
          ],
        );
      await notify(
        user.id,
        "booking_created",
        "Đã giữ chỗ",
        `${code}: ${start}. Thanh toán trong ${process.env.BOOKING_HOLD_MINUTES || 10} phút.`,
        "booking",
        r.insertId,
        c,
      );
      await audit(
        user.id,
        "create_booking",
        "booking",
        r.insertId,
        null,
        { code, court_id: courtId, start_at: start },
        req,
        c,
      );
      created.push({
        id: r.insertId,
        booking_code: code,
        total_amount: total,
        start_at: start,
        end_at: end,
      });
    }
    if (seriesId)
      await c.execute("UPDATE booking_series SET total_amount=? WHERE id=?", [
        created.reduce((a, b) => a + b.total_amount, 0),
        seriesId,
      ]);
    await c.commit();
    return created;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
