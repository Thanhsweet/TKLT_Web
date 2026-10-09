import { safeEqual } from "./http-security.js";
import { fail, integer } from "./validation.js";
export async function bankInfo(booking, one) {
  const bank = await one(
    "SELECT ps.* FROM venue_payment_settings ps JOIN courts c ON c.venue_id=ps.venue_id WHERE c.id=?",
    [booking.court_id],
  );
  if (!bank)
    fail(
      "Chủ sân chưa cấu hình tài khoản nhận tiền. Vui lòng liên hệ hỗ trợ.",
      409,
    );
  const code = booking.booking_code.replace(/[^A-Z0-9]/gi, "");
  const query = new URLSearchParams({
    acc: bank.account_number,
    bank: bank.bank_code,
    amount: String(booking.total_amount),
    des: code,
  });
  return { ...bank, memo: code, qr_url: `https://qr.sepay.vn/img?${query}` };
}
export function authenticateWebhook(req) {
  if (
    !process.env.SEPAY_WEBHOOK_KEY ||
    !safeEqual(
      req.headers.authorization,
      `Apikey ${process.env.SEPAY_WEBHOOK_KEY}`,
    )
  )
    fail("Webhook không được xác thực.", 401);
}
export async function handleBankEvent(req, body, { pool, one, notify, audit }) {
  authenticateWebhook(req);
  integer(body.id, "Mã giao dịch", 1, Number.MAX_SAFE_INTEGER);
  integer(body.transferAmount, "Số tiền", 1);
  if (body.transferType !== "in") return { success: true };
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [insert] = await c.execute(
      "INSERT IGNORE INTO payment_events(provider,event_id,amount,payload) VALUES('sepay',?,?,?)",
      [String(body.id), body.transferAmount, JSON.stringify(body)],
    );
    if (!insert.affectedRows) {
      await c.commit();
      return { success: true };
    }
    const memo = String(body.content || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const code = memo.match(/N01[A-Z0-9]{16}/)?.[0];
    const b = code
      ? await one(
          `SELECT b.*,p.id AS payment_id,p.status AS payment_status,p.provider,ps.account_number,b.hold_expires_at>NOW() AS active_hold
      FROM bookings b JOIN payments p ON p.booking_id=b.id JOIN courts ct ON ct.id=b.court_id
      JOIN venue_payment_settings ps ON ps.venue_id=ct.venue_id
      WHERE REPLACE(b.booking_code,'-','')=? FOR UPDATE`,
          [code],
          c,
        )
      : null;
    let status = "unmatched",
      note = "Không khớp mã đơn hoặc tài khoản";
    if (b && String(b.account_number) === String(body.accountNumber)) {
      status = "review";
      note = "Sai số tiền, đơn hết hạn hoặc đã xử lý";
      if (
        b.status === "pending" &&
        b.active_hold &&
        b.provider === "bank_transfer" &&
        b.payment_status === "pending" &&
        Number(b.total_amount) === Number(body.transferAmount)
      ) {
        await c.execute(
          "UPDATE payments SET status='paid',paid_at=NOW(),transaction_ref=? WHERE id=?",
          [`SEPAY-${body.id}`, b.payment_id],
        );
        await c.execute(
          "UPDATE bookings SET status='confirmed',hold_expires_at=NULL WHERE id=?",
          [b.id],
        );
        await notify(
          b.user_id,
          "payment_success",
          "Đã nhận thanh toán",
          `Đã xác nhận booking ${b.booking_code}.`,
          "booking",
          b.id,
          c,
        );
        await audit(
          null,
          "bank_payment",
          "booking",
          b.id,
          null,
          { event_id: body.id, amount: body.transferAmount },
          req,
          c,
        );
        status = "processed";
        note = "Khớp đủ số tiền";
      } else
        await notify(
          b.user_id,
          "payment_review",
          "Thanh toán cần kiểm tra",
          "Giao dịch đã nhận nhưng cần chủ sân kiểm tra số tiền hoặc hạn giữ chỗ.",
          "booking",
          b.id,
          c,
        );
    }
    await c.execute(
      "UPDATE payment_events SET booking_id=?,status=?,note=? WHERE id=?",
      [b?.id || null, status, note, insert.insertId],
    );
    await c.commit();
    return { success: true };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
