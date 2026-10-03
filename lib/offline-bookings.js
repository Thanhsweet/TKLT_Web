import { bookingCode } from './security.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const first = async (connection, sql, params) => (await connection.execute(sql, params))[0][0];

function bookingTime(value) {
  const text = String(value || '').replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/.test(text)) fail('Thông tin khung giờ không hợp lệ.');
  const date = new Date(`${text.replace(' ', 'T')}Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19).replace('T', ' ') !== text) fail('Thông tin khung giờ không hợp lệ.');
  return text;
}

export async function createOfflineBooking(pool, actorId, body, { moneyRule, audit }) {
  const courtId = Number(body.court_id);
  const name = String(body.guest_name || '').trim();
  const phone = String(body.guest_phone || '').trim().replace(/[\s().-]/g, '');
  const payment = body.payment_method || 'unpaid';
  if (!Number.isSafeInteger(courtId) || courtId <= 0) fail('Vui lòng chọn sân.');
  if (name.length < 2 || name.length > 150) fail('Tên khách cần từ 2 đến 150 ký tự.');
  if (!/^\+?\d{9,15}$/.test(phone)) fail('Số điện thoại khách không hợp lệ.');
  if (!['unpaid', 'cash', 'bank_transfer'].includes(payment)) fail('Hình thức thu tiền không hợp lệ.');
  const startAt = bookingTime(body.start_at), endAt = bookingTime(body.end_at);
  if (startAt >= endAt || startAt.slice(0, 10) !== endAt.slice(0, 10)) fail('Thông tin khung giờ không hợp lệ.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const court = await first(connection, `SELECT c.*, v.status AS venue_status,
      TIME_FORMAT(v.open_time, '%H:%i') AS open_time, TIME_FORMAT(v.close_time, '%H:%i') AS close_time,
      ? >= NOW() AS future_slot
      FROM courts c JOIN venues v ON v.id = c.venue_id JOIN sports s ON s.id = c.sport_id
      WHERE c.id = ? AND s.status = 'active' FOR UPDATE`, [startAt, courtId]);
    if (!court || court.status !== 'active' || court.venue_status !== 'active') fail('Sân không tồn tại hoặc đang ngừng hoạt động.', 404);
    const assignment = await first(connection, `SELECT id FROM staff_assignments
      WHERE staff_id = ? AND venue_id = ? AND position = 'receptionist' AND active = TRUE LIMIT 1 FOR UPDATE`, [actorId, court.venue_id]);
    if (!assignment) fail('Bạn chỉ được đặt sân tại cơ sở được phân công.', 403);
    const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const start = minutes(startAt.slice(11)), end = minutes(endAt.slice(11)), open = minutes(court.open_time);
    if (!court.future_slot || start < open || end > minutes(court.close_time) || end - start !== court.slot_minutes || (start - open) % court.slot_minutes !== 0) {
      fail('Vui lòng chọn khung giờ còn trống trong giờ mở cửa và chưa bắt đầu.');
    }
    const conflict = await first(connection, `SELECT id FROM bookings WHERE court_id = ?
      AND (status IN ('confirmed','checked_in','cancel_requested') OR (status = 'pending' AND hold_expires_at > NOW()))
      AND start_at < ? AND end_at > ? LIMIT 1 FOR UPDATE`, [courtId, endAt, startAt]);
    const blocked = await first(connection, `SELECT id FROM maintenance_blocks WHERE court_id = ? AND active = TRUE
      AND start_at < ? AND end_at > ? LIMIT 1 FOR UPDATE`, [courtId, endAt, startAt]);
    if (conflict || blocked) fail('Khung giờ vừa được đặt hoặc bị chặn bảo trì. Vui lòng chọn giờ khác.', 409);
    const subtotal = await moneyRule(courtId, startAt, connection);
    const code = bookingCode();
    const [result] = await connection.execute(`INSERT INTO bookings
      (booking_code, user_id, guest_name, guest_phone, court_id, start_at, end_at, subtotal, total_amount, status, note)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
    [code, name, phone, courtId, startAt, endAt, subtotal, subtotal, String(body.note || '').trim().slice(0, 500)]);
    const paid = payment !== 'unpaid';
    await connection.execute(`INSERT INTO payments (booking_id, provider, amount, status, paid_at)
      VALUES (?, ?, ?, ?, IF(? = 1, NOW(), NULL))`, [result.insertId, paid ? payment : 'cash', subtotal, paid ? 'paid' : 'pending', paid ? 1 : 0]);
    await audit(actorId, 'create_offline_booking', 'booking', result.insertId, null,
      { code, court_id: courtId, start_at: startAt, guest_name: name, guest_phone: phone, payment_method: payment }, connection);
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function collectOfflinePayment(pool, actorId, bookingId, method, audit) {
  if (!['cash', 'bank_transfer'].includes(method)) fail('Chọn tiền mặt hoặc chuyển khoản đã nhận.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const booking = await first(connection, `SELECT b.* FROM bookings b JOIN courts c ON c.id = b.court_id
      WHERE b.id = ? AND b.guest_name IS NOT NULL AND c.venue_id IN
      (SELECT venue_id FROM staff_assignments WHERE staff_id = ? AND position = 'receptionist' AND active = TRUE) FOR UPDATE`, [bookingId, actorId]);
    if (!booking) fail('Không tìm thấy đơn đặt trực tiếp tại cơ sở của bạn.', 404);
    if (!['confirmed', 'checked_in', 'completed'].includes(booking.status)) fail('Đơn này không thể thu tiền.', 409);
    const payment = await first(connection, 'SELECT id, status FROM payments WHERE booking_id = ? FOR UPDATE', [bookingId]);
    if (!payment || payment.status !== 'pending') fail('Đơn đã thu tiền hoặc không thể thanh toán.', 409);
    await connection.execute("UPDATE payments SET provider = ?, status = 'paid', paid_at = NOW() WHERE id = ?", [method, payment.id]);
    await audit(actorId, 'collect_offline_payment', 'booking', bookingId, { payment_status: 'pending' }, { payment_status: 'paid', method }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
