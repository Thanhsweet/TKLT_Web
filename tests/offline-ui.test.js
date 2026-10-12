import test from 'node:test';
import assert from 'node:assert/strict';
import { frontend, dashboardData } from './helpers/frontend.js';
import { openBooking, createBooking, loadSlots } from '../public/js/bookings.js';
import { bindCourtEvents, loadCourts } from '../public/js/courts.js';
import { showManagement } from '../public/js/management/index.js';

test('lễ tân mở form với sân được phân công và gửi thông tin khách tới API offline', async (t) => {
  const courts = [{ id: 9, name: 'Sân tại quầy', venue_name: 'Cơ sở 1', address: 'Địa chỉ', district: 'Quận' }];
  const app = frontend(t, (path) => {
    if (path === '/api/staff/courts') return { courts };
    if (path.startsWith('/api/courts?')) return { courts: [] };
    if (path.includes('/slots?')) return { slots: [] };
    if (path.startsWith('/api/staff/dashboard')) return dashboardData('receptionist');
    assert.equal(path, '/api/staff/bookings');
    return { booking: { id: 42, booking_code: 'N01-TEST', court_name: 'Sân tại quầy', start_at: '2030-01-02T08:00:00', total_amount: 100000, guest_name: 'Khách tại quầy', guest_phone: '0901234567', payment_status: 'pending' } };
  });
  app.state.user = { role: 'receptionist' };
  await openBooking();
  assert.equal(app.element('#booking-dialog').open, true);
  assert.equal(app.element('#offline-booking-fields').classList.contains('hidden'), false);
  assert.equal(app.element('#promotion-field').classList.contains('hidden'), true);
  assert.equal(app.element('#booking-date').value, '2030-01-02');
  assert.equal(app.state.selectedCourt.id, 9);
  app.state.selectedSlot = { start_at: '2030-01-02T08:00:00', end_at: '2030-01-02T09:00:00' };
  app.element('#guest-name').value = 'Khách tại quầy';
  app.element('#guest-phone').value = '0901234567';
  await createBooking();
  const call = app.calls.find((entry) => entry.path === '/api/staff/bookings');
  assert.ok(call);
  assert.equal(call.options.method, 'POST');
  const body = JSON.parse(call.options.body);
  assert.equal(body.guest_name, 'Khách tại quầy');
  assert.equal(body.guest_phone, '0901234567');
  assert.equal(body.payment_method, 'unpaid');
  assert.equal(body.court_id, 9);
  assert.equal(app.element('#pay-now').classList.contains('hidden'), true);
  assert.equal(app.element('#login-dialog').open, false);
  assert.match(app.element('#success-detail').textContent, /Đã xác nhận/);
  assert.equal(app.element('#toast').textContent, '');
});

test('sân ngoài phân công không mở form đặt cho lễ tân', async (t) => {
  const app = frontend(t, () => ({ courts: [{ id: 9 }] }));
  app.state.user = { role: 'receptionist' };
  await openBooking(10);
  assert.equal(app.element('#booking-dialog').open, false);
  assert.equal(app.state.selectedCourt, null);
});

test('đổi sân khi đang tải lịch bỏ qua kết quả cũ', async (t) => {
  const pending = [];
  const app = frontend(t, () => new Promise((resolve) => pending.push(resolve)));
  app.state.selectedCourt = { id: 1 };
  const first = loadSlots();
  app.state.selectedCourt = { id: 2 };
  const second = loadSlots();
  pending[1]({ slots: [{ label: 'Sân 2', available: true, price: 100000 }] });
  await second;
  pending[0]({ slots: [{ label: 'Sân 1', available: true, price: 100000 }] });
  await first;
  assert.match(app.element('#slot-grid').innerHTML, /Sân 2/);
  assert.doesNotMatch(app.element('#slot-grid').innerHTML, /Sân 1/);
});

test('nút xem lịch vẫn hoạt động sau khi tải lại danh sách sân', async (t) => {
  const app = frontend(t, () => ({ courts: [] }));
  const opened = [];
  bindCourtEvents((id) => opened.push(id));
  for (const id of [9, 10]) {
    await loadCourts();
    app.element('#court-grid').dispatch('click', {
      target: { closest: (selector) => selector === '[data-book-court]' ? { dataset: { bookCourt: String(id) } } : null }
    });
  }
  assert.deepEqual(opened, [9, 10]);
});

test('các module quản lý hiển thị màn hình cho từng vai trò', async (t) => {
  const app = frontend(t, () => dashboardData(app.state.user.role));
  for (const role of ['owner', 'admin', 'receptionist', 'technician', 'cleaner']) {
    app.state.user = { role };
    await showManagement();
    assert.equal(app.element('#toast').textContent, '', role);
    assert.ok(app.element('#management-table').innerHTML.includes('<table>'), role);
    assert.equal(app.element('#staff-booking-create').classList.contains('hidden'), role !== 'receptionist');
  }
});

test('entry point nạp module, khởi tạo phiên và gắn nút đặt sân lễ tân', async (t) => {
  const app = frontend(t, (path) => {
    if (path === '/api/bootstrap') return { sports: [], districts: [], user: { role: 'receptionist', full_name: 'Lễ Tân', loyalty_points: 0 } };
    if (path === '/api/staff/courts') return { courts: [{ id: 9, name: 'Sân A', venue_name: 'Cơ sở A', address: '', district: '' }] };
    if (path === '/api/staff/bookings') return { booking: { id: 42, booking_code: 'N01-TEST', court_name: 'Sân A', start_at: '2030-01-02T08:00:00', total_amount: 100000, guest_name: 'Khách tại quầy', guest_phone: '0901234567', payment_status: 'pending' } };
    if (path.includes('/slots?')) return { slots: [] };
    return { courts: [] };
  });
  const { ready } = await import('../public/js/app.js');
  await ready;
  assert.equal(app.state.user.role, 'receptionist');
  assert.equal(app.element('#profile-name').textContent, 'Lễ Tân');
  await app.element('#staff-booking-create').dispatch('click');
  assert.equal(app.element('#booking-dialog').open, true);
  app.state.selectedSlot = { start_at: '2030-01-02T08:00:00', end_at: '2030-01-02T09:00:00' };
  app.element('#guest-name').value = 'Khách tại quầy';
  app.element('#guest-phone').value = '0901234567';
  await app.element('#confirm-booking').dispatch('click');
  assert.ok(app.calls.some((c) => c.path === '/api/staff/bookings'));
  assert.equal(app.element('#success-dialog').open, true);
  assert.equal(app.element('#login-dialog').open, false);
  assert.equal(app.element('#toast').textContent, '');
});
