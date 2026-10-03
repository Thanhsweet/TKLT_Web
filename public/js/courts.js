import { state } from './core/state.js';
import { api } from './core/api.js';
import { $, $$, showDialog, toast } from './core/dom.js';
import { escapeHtml, money } from './core/format.js';
import { isCustomer } from './session.js';

function sportCode(slug) { return ({ 'bong-da': 'BĐ', 'cau-long': 'CL', tennis: 'TN', 'bong-ro': 'BR', pickleball: 'PB' })[slug] || 'SP'; }

export function renderBootstrap() {
  $('#sport-select').insertAdjacentHTML('beforeend', state.sports.map((s) => `<option value="${escapeHtml(s.slug)}">${escapeHtml(s.name)}</option>`).join(''));
  $('#district-select').insertAdjacentHTML('beforeend', state.districts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join(''));
  $('#sport-chips').innerHTML = `<button class="sport-chip active" type="button" data-sport=""><span class="sport-symbol">ALL</span>Tất cả</button>${state.sports.map((s) => `<button class="sport-chip" type="button" data-sport="${escapeHtml(s.slug)}"><span class="sport-symbol">${sportCode(s.slug)}</span>${escapeHtml(s.name)}</button>`).join('')}`;
  $$('.sport-chip').forEach((button) => button.addEventListener('click', () => {
    $$('.sport-chip').forEach((item) => item.classList.toggle('active', item === button));
    $('#sport-select').value = button.dataset.sport; state.filters.sport = button.dataset.sport; loadCourts(true);
  }));
}

function courtCard(court) {
  const amenities = court.amenities.slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join('');
  return `<article class="court-card">
    <div class="court-art ${escapeHtml(court.sport_slug)}">
      <span class="art-badge">${court.indoor ? 'Trong nhà' : 'Ngoài trời'}</span>
      <button class="favorite-button ${court.is_favorite ? 'active' : ''}" type="button" data-favorite="${court.venue_id}" aria-label="${court.is_favorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}" aria-pressed="${court.is_favorite}"><svg><use href="#i-heart"/></svg></button>
      <span class="sport-monogram">${sportCode(court.sport_slug)}</span>
    </div>
    <div class="court-body">
      <div class="court-title-row"><div><h3>${escapeHtml(court.name)}</h3><div class="venue-name">${escapeHtml(court.venue_name)} · ${escapeHtml(court.sport_name)}</div></div><span class="rating"><svg><use href="#i-star"/></svg>${court.rating}</span></div>
      <div class="court-location"><svg><use href="#i-pin"/></svg><span>${escapeHtml(court.address)}, ${escapeHtml(court.district)}</span></div>
      <div class="amenity-list">${amenities}</div>
      <div class="court-footer"><div class="price">Từ <strong>${money(court.base_price)} / giờ</strong></div><button class="button button-primary" type="button" data-book-court="${court.id}">Xem lịch <svg><use href="#i-arrow"/></svg></button></div>
    </div>
  </article>`;
}

function renderCourts() {
  $('#result-count').textContent = state.courts.length;
  $('#court-grid').innerHTML = state.courts.map(courtCard).join('');
  $('#court-grid').classList.toggle('hidden', !state.courts.length); $('#empty-state').classList.toggle('hidden', Boolean(state.courts.length));
  const active = [state.filters.sport && state.sports.find((item) => item.slug === state.filters.sport)?.name, state.filters.district, state.filters.q && `“${state.filters.q}”`].filter(Boolean);
  $('#filter-summary').classList.toggle('hidden', !active.length); $('#filter-summary').textContent = active.length ? `Đang lọc: ${active.join(' · ')}` : '';
}

export async function loadCourts(scroll = false) {
  $('#court-grid').innerHTML = Array.from({ length: 6 }, () => '<div class="slot-skeleton" style="height:360px"></div>').join('');
  const params = new URLSearchParams(Object.entries(state.filters).filter(([, value]) => value));
  try { state.courts = (await api(`/api/courts?${params}`)).courts; renderCourts(); if (scroll) $('#courts').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  catch (error) { $('#court-grid').innerHTML = ''; toast(error.message); }
}

async function toggleFavorite(venueId) {
  if (!isCustomer()) { showDialog('login-dialog'); return toast('Đăng nhập bằng tài khoản khách hàng để lưu sân yêu thích.'); }
  try { const data = await api(`/api/venues/${venueId}/favorite`, { method: 'POST', body: '{}' }); state.courts.filter((c) => c.venue_id === venueId).forEach((c) => { c.is_favorite = data.favorite; }); renderCourts(); toast(data.favorite ? 'Đã thêm vào sân yêu thích.' : 'Đã bỏ khỏi sân yêu thích.'); }
  catch (error) { toast(error.message); }
}

// Delegate clicks so replacing the results does not require rebinding handlers.
// The entry point supplies booking navigation to keep dependencies one-way.
export function bindCourtEvents(openBooking) {
  $('#court-grid').addEventListener('click', (event) => {
    const bookButton = event.target.closest('[data-book-court]');
    if (bookButton) return openBooking(Number(bookButton.dataset.bookCourt));
    const favoriteButton = event.target.closest('[data-favorite]');
    if (favoriteButton) return toggleFavorite(Number(favoriteButton.dataset.favorite));
  });
}
