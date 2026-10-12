import { state } from './core/state.js';
import { api } from './core/api.js';
import { $, $$, showDialog, closeDialog, toast } from './core/dom.js';
import { escapeHtml, money, dateTime, statusText } from './core/format.js';
import { isCustomer } from './session.js';
import { loadCourts } from './courts.js';
import { showManagement } from './management/index.js';

function renderSlots(slots) {
  $('#slot-grid').innerHTML = slots.map((slot, index) => `<button class="slot-button" type="button" data-slot="${index}" ${slot.available ? '' : 'disabled'}><span>${slot.label}</span><small>${slot.available ? money(slot.price) : 'Không khả dụng'}</small></button>`).join('');
  $$('.slot-button:not(:disabled)').forEach((button) => button.addEventListener('click', () => {
    state.selectedSlot = slots[Number(button.dataset.slot)]; $$('.slot-button').forEach((item) => item.classList.toggle('active', item === button));
    $('#summary-time').textContent = `${$('#booking-date').value.split('-').reverse().join('/')} · ${state.selectedSlot.label}`;
    $('#summary-subtotal').textContent = money(state.selectedSlot.price); $('#summary-total').textContent = money(state.selectedSlot.price); $('#confirm-booking').disabled = false;
  }));
}

export async function loadSlots() {
  const courtId = state.selectedCourt.id, date = $('#booking-date').value;
  const requestId = (loadSlots.requestId || 0) + 1; loadSlots.requestId = requestId;
  state.selectedSlot = null; $('#confirm-booking').disabled = true; $('#summary-time').textContent = 'Chưa chọn'; $('#summary-subtotal').textContent = '—'; $('#summary-total').textContent = '—';
  $('#slot-grid').innerHTML = Array.from({ length: 12 }, () => '<div class="slot-skeleton"></div>').join('');
  try { const data = await api(`/api/courts/${courtId}/slots?date=${encodeURIComponent(date)}`); if (requestId === loadSlots.requestId) renderSlots(data.slots); }
  catch (error) { if (requestId === loadSlots.requestId) $('#slot-grid').innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

export function selectBookingCourt(court) {
  state.selectedCourt = court;
  $('#booking-court-name').textContent = state.selectedCourt.name; $('#booking-venue').textContent = `${state.selectedCourt.venue_name} · ${state.selectedCourt.address}, ${state.selectedCourt.district}`;
  $('#summary-court').textContent = state.selectedCourt.name;
}

export async function openBooking(courtId) {
  const offline = state.user?.role === 'receptionist';
  try {
    if (offline) {
      state.offlineCourts = (await api('/api/staff/courts')).courts;
      if (!state.offlineCourts.length) return toast('Chưa có sân hoạt động tại cơ sở được phân công.');
      if (courtId && !state.offlineCourts.some((court) => court.id === courtId)) return toast('Bạn chỉ được đặt sân tại cơ sở được phân công.');
      $('#offline-court').innerHTML = state.offlineCourts.map((court) => `<option value="${court.id}">${escapeHtml(court.venue_name)} · ${escapeHtml(court.name)}</option>`).join('');
      $('#offline-court').value = courtId || state.offlineCourts[0].id;
    }
    const court = (offline ? state.offlineCourts : state.courts).find((item) => item.id === (courtId || Number($('#offline-court').value)));
    if (!court) return;
    selectBookingCourt(court);
  } catch (error) { return toast(error.message); }
  $('#offline-booking-fields').classList.toggle('hidden', !offline); $('#promotion-field').classList.toggle('hidden', offline);
  $('#booking-eyebrow').textContent = offline ? 'LỄ TÂN ĐẶT SÂN CHO KHÁCH' : 'ĐẶT SÂN TRỰC TUYẾN';
  $('#booking-summary-note').textContent = offline ? 'Đơn được xác nhận ngay. Chỉ chọn đã nhận tiền khi đã thu đủ tiền của khách.' : 'Bạn có thể thanh toán mô phỏng sau khi tạo đơn.';
  $('#confirm-booking').textContent = offline ? 'Xác nhận đặt cho khách' : 'Xác nhận đặt sân';
  const staffDate = $('#staff-work-date')?.value || $('#date-input').value;
  $('#booking-date').value = offline ? (staffDate >= $('#booking-date').min ? staffDate : $('#booking-date').min) : $('#date-input').value;
  $('#promotion-code').value = ''; $('#booking-note').value = ''; $('#guest-name').value = ''; $('#guest-phone').value = ''; $('#offline-payment').value = 'unpaid';
  showDialog('booking-dialog'); await loadSlots();
}

export async function createBooking({ onCreated } = {}) {
  const offline = state.user?.role === 'receptionist';
  if (!isCustomer() && !offline) { closeDialog('booking-dialog'); showDialog('login-dialog'); return toast('Đăng nhập bằng tài khoản khách hàng hoặc lễ tân để đặt sân.'); }
  if (!state.selectedSlot) return;
  if (offline && (!$('#guest-name').reportValidity() || !$('#guest-phone').reportValidity())) return;
  const button = $('#confirm-booking'); const original = button.textContent; button.disabled = true; button.textContent = 'Đang giữ chỗ…';
  try {
    const body = { court_id: state.selectedCourt.id, start_at: state.selectedSlot.start_at, end_at: state.selectedSlot.end_at, promotion_code: $('#promotion-code').value.trim(), note: $('#booking-note').value.trim() };
    if (offline) Object.assign(body, { guest_name: $('#guest-name').value.trim(), guest_phone: $('#guest-phone').value.trim(), payment_method: $('#offline-payment').value });
    const data = await api(offline ? '/api/staff/bookings' : '/api/bookings', { method: 'POST', body: JSON.stringify(body) });
    state.activeBooking = data.booking; closeDialog('booking-dialog'); $('#success-code').textContent = data.booking.booking_code;
    $('#success-detail').textContent = `${data.booking.court_name} · ${dateTime(data.booking.start_at)} · ${money(data.booking.total_amount)}. ${offline ? `${data.booking.guest_name} · ${data.booking.guest_phone}. Đã xác nhận · ${statusText(data.booking.payment_status)}.` : 'Giữ chỗ trong 10 phút.'}`;
    $('#pay-now').classList.toggle('hidden', offline);
    showDialog('success-dialog');
    if (onCreated) await onCreated();
    else {
      await loadCourts();
      if (offline) { if ($('#staff-work-date')) $('#staff-work-date').value = $('#booking-date').value; await showManagement(); }
    }
  } catch (error) { toast(error.message); if (error.status === 401) { closeDialog('booking-dialog'); showDialog('login-dialog'); } }
  finally { button.textContent = original; button.disabled = !state.selectedSlot; }
}

export async function payBooking(id = state.activeBooking?.id) {
  if (!id) return; const button = $('#pay-now'); button.disabled = true; button.textContent = 'Đang xử lý…';
  try { const data = await api(`/api/bookings/${id}/pay`, { method: 'POST', body: '{}' }); state.activeBooking = data.booking; closeDialog('success-dialog'); toast('Thanh toán thành công, booking đã được xác nhận.'); await showDashboard(); }
  catch (error) { toast(error.message); } finally { button.disabled = false; button.textContent = 'Thanh toán mô phỏng'; }
}

export async function showDashboard() {
  if (!isCustomer()) return showDialog('login-dialog');
  try {
    const data = await api('/api/bookings');
    $('#booking-list').innerHTML = data.bookings.length ? data.bookings.map((b) => `<article class="booking-item">
      <div><h3>${escapeHtml(b.court_name)}</h3><p>${escapeHtml(b.venue_name)} · ${escapeHtml(b.address)}</p><small>${escapeHtml(b.booking_code)}</small></div>
      <div class="booking-time">${dateTime(b.start_at)}<small>${money(b.total_amount)}</small></div><span class="status ${b.status}">${statusText(b.status)}</span>
      <div class="booking-actions">${b.payment_status !== 'paid' && b.status === 'pending' ? `<button class="button button-primary" data-pay="${b.id}" type="button">Thanh toán</button>` : ''}${['pending','confirmed'].includes(b.status) ? `<button class="button button-outline" data-cancel="${b.id}" type="button">Yêu cầu hủy</button>` : ''}${b.status === 'completed' ? `<button class="button button-outline" data-review="${b.id}" type="button">Đánh giá</button>` : ''}</div>
    </article>`).join('') : '<div class="empty-state"><h3>Bạn chưa có lịch đặt sân</h3><p>Chọn một sân phù hợp để bắt đầu.</p></div>';
    $$('[data-pay]').forEach((b) => b.addEventListener('click', () => payBooking(Number(b.dataset.pay))));
    $$('[data-cancel]').forEach((b) => b.addEventListener('click', () => cancelBooking(Number(b.dataset.cancel))));
    $$('[data-review]').forEach((b) => b.addEventListener('click', () => reviewBooking(Number(b.dataset.review))));
    $('#dashboard-section').classList.remove('hidden'); $('#management-section').classList.add('hidden'); $('#dashboard-section').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { toast(error.message); }
}

async function cancelBooking(id) {
  const reason = prompt('Nhập lý do hủy booking:'); if (reason === null) return;
  try { const data = await api(`/api/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }); toast(data.booking.status === 'cancel_requested' ? 'Đã gửi yêu cầu để chủ sân xét duyệt.' : 'Đã hủy booking.'); await showDashboard(); await loadCourts(); }
  catch (error) { toast(error.message); }
}

async function reviewBooking(id) {
  const rating = prompt('Chấm điểm từ 1 đến 5:'); if (rating === null) return; const comment = prompt('Nhận xét của bạn:') ?? '';
  try { await api(`/api/bookings/${id}/review`, { method: 'POST', body: JSON.stringify({ rating:Number(rating), comment }) }); toast('Cảm ơn bạn đã đánh giá.'); await loadCourts(); }
  catch (error) { toast(error.message); }
}
