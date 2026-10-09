import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineBooking } from '../lib/offline-bookings.js';
import { ensureOfflineBookingSchema } from '../database/migrations.js';

test('đặt tại quầy kiểm tra thông tin trước khi mở giao dịch', async () => {
  const pool = { getConnection() { throw new Error('Không được mở giao dịch cho dữ liệu sai'); } };
  const valid = { court_id: 1, guest_name: 'Khách tại quầy', guest_phone: '0901234567', start_at: '2030-01-01T08:00:00', end_at: '2030-01-01T09:00:00' };
  for (const change of [
    { guest_name: '' }, { guest_name: 'x'.repeat(151) }, { guest_phone: 'abc' },
    { payment_method: 'demo' }, { court_id: -1 }, { start_at: '2030-02-30T08:00:00' },
    { end_at: valid.start_at }, { end_at: '2030-01-02T09:00:00' }
  ]) {
    await assert.rejects(createOfflineBooking(pool, 3, { ...valid, ...change }, {}), { status: 400 });
  }
});

test('nâng cấp schema hiện có bằng một ALTER và không thay đổi schema đã nâng cấp', async () => {
  const statements = [];
  await ensureOfflineBookingSchema({
    execute: async () => [[{ COLUMN_NAME: 'user_id', IS_NULLABLE: 'NO' }]],
    query: async (sql) => statements.push(sql)
  });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /MODIFY COLUMN user_id BIGINT UNSIGNED NULL/);
  assert.match(statements[0], /ADD COLUMN guest_name/);
  assert.match(statements[0], /ADD COLUMN guest_phone/);
  await ensureOfflineBookingSchema({
    execute: async () => [[
      { COLUMN_NAME: 'user_id', IS_NULLABLE: 'YES' },
      { COLUMN_NAME: 'guest_name', IS_NULLABLE: 'YES' },
      { COLUMN_NAME: 'guest_phone', IS_NULLABLE: 'YES' }
    ]],
    query: async () => assert.fail('Schema đã nâng cấp không cần ALTER')
  });
});

// Opt in to HTTP + MySQL integration checks. Fixtures are isolated and removed afterwards.
test('lễ tân đặt offline, phân quyền, chống trùng, thu tiền và hoàn tất trên MySQL', { skip: process.env.N01_TEST_MYSQL !== '1' }, async (t) => {
  process.env.NODE_ENV = 'test';
  const paymentMode = process.env.PAYMENT_MODE;
  process.env.PAYMENT_MODE = 'demo';
  t.after(() => { if (paymentMode === undefined) delete process.env.PAYMENT_MODE; else process.env.PAYMENT_MODE = paymentMode; });
  const { default: pool } = await import('../database/mysql.js');
  const { server } = await import('../server.js');
  const { hashPassword, tokenHash } = await import('../lib/security.js');
  const { randomUUID } = await import('node:crypto');
  const tag = randomUUID();
  const users = [], venues = [], courts = [];
  let receptionist, owner, customer, day, otherCourt;
  const cookies = {};
  const insert = async (sql, params) => (await pool.execute(sql, params))[0].insertId;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, role = 'receptionist', body, method = body ? 'POST' : 'GET') => {
    const { csrfFor } = await import('../lib/http-security.js');
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookies[role] ? { Cookie: cookies[role], 'X-CSRF-Token': csrfFor(cookies[role].split('=')[1]) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    await ensureOfflineBookingSchema(pool);
    for (const role of ['owner', 'receptionist', 'customer', 'technician']) {
      const id = await insert("INSERT INTO users (full_name,email,password_hash,role,status) VALUES (?,?,?,?,'active')", [`Test ${role}`, `${tag}-${role}@example.test`, hashPassword('Test@12345'), role]);
      users.push(id);
      const token = randomUUID();
      await pool.execute('INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))', [tokenHash(token), id]);
      cookies[role] = `n01_session=${token}`;
      if (role === 'owner') owner = id;
      if (role === 'receptionist') receptionist = id;
      if (role === 'customer') customer = id;
    }
    const [[sport]] = await pool.execute("SELECT id FROM sports WHERE status='active' LIMIT 1");
    for (let i = 0; i < 2; i++) {
      const venue = await insert("INSERT INTO venues (owner_id,name,slug,description,address,district,city,open_time,close_time,status) VALUES (?,?,?,'Test description',?,?,?,'05:00','23:00','active')", [owner, `Test venue ${i}`, `${tag}-${i}`, 'Test address', 'Test district', 'Test city']);
      venues.push(venue);
      courts.push(await insert("INSERT INTO courts (venue_id,sport_id,name,surface,base_price,slot_minutes,status) VALUES (?,?,?,'Test surface',100000,60,'active')", [venue, sport.id, `Test court ${i}`]));
    }
    otherCourt = courts[1];
    await pool.execute("INSERT INTO staff_assignments (staff_id,venue_id,position,shift_start,shift_end,active) VALUES (?,?,'receptionist',NOW(),DATE_ADD(NOW(),INTERVAL 10 DAY),TRUE)", [receptionist, venues[0]]);
    const [[date]] = await pool.execute("SELECT DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 DAY),'%Y-%m-%d') AS day");
    day = date.day;
    const body = (hour, extra = {}) => ({ court_id: courts[0], guest_name: 'Khách offline kiểm thử', guest_phone: '090 123 4567', start_at: `${day}T${String(hour).padStart(2, '0')}:00:00`, end_at: `${day}T${String(hour + 1).padStart(2, '0')}:00:00`, ...extra });
    await t.test('chặn tài khoản chưa đăng nhập, sai vai trò và khác cơ sở', async () => {
      assert.equal((await request('/api/staff/bookings', 'anonymous', body(8))).status, 401);
      for (const role of ['customer', 'technician', 'owner']) {
        assert.equal((await request('/api/staff/bookings', role, body(8))).status, 403);
        assert.equal((await request('/api/staff/courts', role)).status, 403);
      }
      assert.equal((await request('/api/staff/bookings', 'receptionist', body(8, { court_id: otherCourt }))).status, 403);
      const listed = await request('/api/staff/courts');
      assert.equal(listed.status, 200);
      assert.deepEqual(listed.data.courts.map((court) => court.id), [courts[0]]);
    });
    await t.test('chặn giờ quá khứ, ngoài giờ mở cửa, sai độ dài và lệch slot', async () => {
      for (const invalid of [body(3), body(8, { end_at: `${day}T10:00:00` }), body(8, { start_at: `${day}T08:30:00`, end_at: `${day}T09:30:00` }), body(8, { start_at: '2000-01-01T08:00:00', end_at: '2000-01-01T09:00:00' })]) {
        assert.equal((await request('/api/staff/bookings', 'receptionist', invalid)).status, 400);
      }
    });
    let bookingId;
    await t.test('hai yêu cầu đồng thời chỉ tạo một đơn; đơn chưa thu giữ sân và không hết hạn', async () => {
      const responses = await Promise.all([request('/api/staff/bookings', 'receptionist', body(8)), request('/api/staff/bookings', 'receptionist', body(8))]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      const booking = responses.find((r) => r.status === 201).data.booking;
      bookingId = booking.id;
      assert.equal(booking.user_id, null);
      assert.equal(booking.guest_phone, '0901234567');
      assert.equal(booking.status, 'confirmed');
      assert.equal(booking.hold_expires_at, null);
      assert.equal(booking.payment_status, 'pending');
      const slots = await request(`/api/courts/${courts[0]}/slots?date=${day}`);
      assert.equal(slots.data.slots.find((slot) => slot.start_at === `${day}T08:00:00`).available, false);
    });
    await t.test('bảo trì chặn đặt và lỗi không tạo dữ liệu dở dang', async () => {
      await pool.execute('INSERT INTO maintenance_blocks (court_id,start_at,end_at,reason,created_by) VALUES (?,?,?,?,?)', [courts[0], `${day} 10:00:00`, `${day} 11:00:00`, 'Test maintenance', owner]);
      assert.equal((await request('/api/staff/bookings', 'receptionist', body(10))).status, 409);
      const [[count]] = await pool.execute('SELECT COUNT(*) AS n FROM bookings WHERE court_id=?', [courts[0]]);
      assert.equal(count.n, 1);
    });
    await t.test('thu sau chống ghi nhận hai lần và kiểm tra quyền', async () => {
      const payment = { payment_method: 'cash' };
      assert.equal((await request(`/api/staff/bookings/${bookingId}/pay`, 'customer', payment)).status, 403);
      assert.equal((await request(`/api/staff/bookings/${bookingId}/pay`, 'receptionist', { payment_method: 'demo' })).status, 400);
      const responses = await Promise.all([request(`/api/staff/bookings/${bookingId}/pay`, 'receptionist', payment), request(`/api/staff/bookings/${bookingId}/pay`, 'receptionist', payment)]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    });
    await t.test('đã thu tiền mặt và chuyển khoản khi tạo đơn', async () => {
      for (const [hour, method] of [[12, 'cash'], [14, 'bank_transfer']]) {
        const response = await request('/api/staff/bookings', 'receptionist', body(hour, { payment_method: method }));
        assert.equal(response.status, 201, JSON.stringify(response.data));
        assert.equal(response.data.booking.payment_status, 'paid');
        assert.equal(response.data.booking.payment_provider, method);
      }
    });
    await t.test('lịch lễ tân theo ngày và tổng quan chủ sân có khách offline', async () => {
      const dashboard = await request(`/api/staff/dashboard?date=${day}`);
      const booking = dashboard.data.work.find((b) => b.id === bookingId);
      assert.equal(booking.full_name, 'Khách offline kiểm thử');
      assert.equal(booking.phone, '0901234567');
      assert.equal(booking.payment_status, 'paid');
      const lookup = await request(`/api/manage/bookings?date=${day}&q=${encodeURIComponent('Khách offline')}`);
      assert.ok(lookup.data.bookings.some((b) => b.id === bookingId && b.full_name === booking.full_name));
      const invoice = await request(`/api/bookings/${bookingId}/invoice`);
      assert.equal(invoice.status, 200);
      assert.equal(invoice.data.booking.full_name, booking.full_name);
      const overview = await request('/api/owner/dashboard', 'owner');
      assert.equal(overview.status, 200);
      assert.ok(overview.data.recent.some((b) => b.id === bookingId && b.full_name === booking.full_name));
      assert.equal(Number(overview.data.metrics.collected), 300000);
    });
    await t.test('khách không có tài khoản vẫn check-in và hoàn tất; không cộng điểm vào lễ tân', async () => {
      await pool.execute('UPDATE bookings SET start_at=DATE_SUB(NOW(),INTERVAL 1 HOUR),end_at=NOW() WHERE id=?', [bookingId]);
      for (const status of ['checked_in', 'completed']) {
        const response = await request(`/api/staff/bookings/${bookingId}/status`, 'receptionist', { status }, 'PATCH');
        assert.equal(response.status, 200, JSON.stringify(response.data));
      }
      const [[cleaning]] = await pool.execute('SELECT COUNT(*) AS n FROM cleaning_tasks WHERE booking_id=?', [bookingId]);
      assert.equal(cleaning.n, 1);
      const [[points]] = await pool.execute('SELECT loyalty_points FROM users WHERE id=?', [receptionist]);
      assert.equal(points.loyalty_points, 0);
      const [[loyalty]] = await pool.execute('SELECT COUNT(*) AS n FROM loyalty_transactions WHERE booking_id=?', [bookingId]);
      assert.equal(loyalty.n, 0);
      const [[audit]] = await pool.execute("SELECT actor_id FROM audit_logs WHERE entity_id=? AND action='create_offline_booking'", [bookingId]);
      assert.equal(audit.actor_id, receptionist);
    });
    await t.test('khách hàng vẫn giữ chỗ và thanh toán theo luồng trực tuyến', async () => {
      const response = await request('/api/bookings', 'customer', body(16));
      assert.equal(response.status, 201, JSON.stringify(response.data));
      assert.equal(response.data.booking.user_id, customer);
      assert.equal(response.data.booking.status, 'pending');
      assert.equal(response.data.booking.guest_name, null);
      assert.equal((await request(`/api/bookings/${response.data.booking.id}/pay`, 'customer', {})).status, 200);
    });
  } finally {
    // Every deletion is limited to the test's generated IDs.
    if (courts.length) {
      const marks = courts.map(() => '?').join(',');
      const [bookings] = await pool.execute(`SELECT id FROM bookings WHERE court_id IN (${marks})`, courts);
      if (bookings.length) {
        const ids = bookings.map((b) => b.id), bookingMarks = ids.map(() => '?').join(',');
        for (const table of ['cleaning_tasks', 'loyalty_transactions', 'payments', 'promotion_uses']) {
          await pool.execute(`DELETE FROM ${table} WHERE booking_id IN (${bookingMarks})`, ids);
        }
      }
      await pool.execute(`DELETE FROM bookings WHERE court_id IN (${marks})`, courts);
      await pool.execute(`DELETE FROM maintenance_blocks WHERE court_id IN (${marks})`, courts);
      await pool.execute(`DELETE FROM courts WHERE id IN (${marks})`, courts);
    }
    if (users.length) {
      const marks = users.map(() => '?').join(',');
      for (const [table, key] of [['notifications', 'user_id'], ['audit_logs', 'actor_id'], ['auth_sessions', 'user_id'], ['staff_assignments', 'staff_id']]) {
        await pool.execute(`DELETE FROM ${table} WHERE ${key} IN (${marks})`, users);
      }
      if (venues.length) await pool.execute(`DELETE FROM venues WHERE id IN (${venues.map(() => '?').join(',')})`, venues);
      await pool.execute(`DELETE FROM users WHERE id IN (${marks})`, users);
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
