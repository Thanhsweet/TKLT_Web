import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

function ui() {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {
        value: '', textContent: '', innerHTML: '', disabled: false, open: false,
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name), add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
        reportValidity: () => true, showModal() { this.open = true; }, close() { this.open = false; }
      });
    }
    return elements.get(selector);
  };
  const context = createContext({ document: { querySelector: element, querySelectorAll: () => [] }, Intl, Date, URLSearchParams, setTimeout, clearTimeout });
  const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8').replace(/\binit\(\);\s*$/, '');
  runInContext(`${app}\nglobalThis.ui = { state, openBooking, createBooking, loadSlots };`, context);
  element('#booking-date').min = '2030-01-01';
  element('#staff-work-date').value = '2030-01-02';
  return { context, element, ...context.ui };
}

test('lễ tân mở form với sân được phân công và gửi thông tin khách tới API offline', async () => {
  const app = ui(), calls = [];
  app.context.calls = calls;
  app.state.user = { role: 'receptionist' };
  app.context.courts = [{ id: 9, name: 'Sân tại quầy', venue_name: 'Cơ sở 1', address: 'Địa chỉ', district: 'Quận' }];
  runInContext(`api = async (path, options) => {
    calls.push({path, options});
    if (path === '/api/staff/courts') return { courts };
    if (path.includes('/slots?')) return { slots: [] };
    return { booking: { id: 42, booking_code: 'N01-TEST', court_name: 'Sân tại quầy', start_at: '2030-01-02T08:00:00', total_amount: 100000, guest_name: 'Khách tại quầy', guest_phone: '0901234567', payment_status: 'pending' } };
  }; loadCourts = async () => {}; showManagement = async () => {};`, app.context);
  await app.openBooking();
  assert.equal(app.element('#booking-dialog').open, true);
  assert.equal(app.element('#offline-booking-fields').classList.contains('hidden'), false);
  assert.equal(app.element('#promotion-field').classList.contains('hidden'), true);
  assert.equal(app.element('#booking-date').value, '2030-01-02');
  assert.equal(app.state.selectedCourt.id, 9);
  app.state.selectedSlot = { start_at: '2030-01-02T08:00:00', end_at: '2030-01-02T09:00:00' };
  app.element('#guest-name').value = 'Khách tại quầy';
  app.element('#guest-phone').value = '0901234567';
  await app.createBooking();
  const call = calls.find((entry) => entry.path === '/api/staff/bookings');
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
});

test('sân ngoài phân công không mở form đặt cho lễ tân', async () => {
  const app = ui();
  app.state.user = { role: 'receptionist' };
  runInContext("api = async () => ({ courts: [{id: 9}] }); toast = () => {};", app.context);
  await app.openBooking(10);
  assert.equal(app.element('#booking-dialog').open, false);
  assert.equal(app.state.selectedCourt, null);
});

test('đổi sân khi đang tải lịch bỏ qua kết quả cũ', async () => {
  const app = ui(), pending = [];
  app.context.pending = pending;
  runInContext('api = () => new Promise((resolve) => pending.push(resolve)); renderSlots = (slots) => { globalThis.rendered = slots; };', app.context);
  app.state.selectedCourt = { id: 1 };
  const first = app.loadSlots();
  app.state.selectedCourt = { id: 2 };
  const second = app.loadSlots();
  pending[1]({ slots: ['Sân 2'] });
  await second;
  pending[0]({ slots: ['Sân 1'] });
  await first;
  assert.deepEqual(app.context.rendered, ['Sân 2']);
});
