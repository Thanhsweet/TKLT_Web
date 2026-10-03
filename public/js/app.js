import { state } from './core/state.js';
import { api } from './core/api.js';
import { $, $$, showDialog, closeDialog, toast } from './core/dom.js';
import { isCustomer, updateSessionUi } from './session.js';
import { login, register, logout, demoAccounts } from './auth.js';
import { renderBootstrap, loadCourts, bindCourtEvents } from './courts.js';
import { openBooking, loadSlots, selectBookingCourt, createBooking, payBooking, showDashboard } from './bookings.js';
import { showManagement } from './management/index.js';
import { openEntityForm, submitEntity } from './management/forms.js';

function setDefaultDates() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  ['#date-input', '#booking-date'].forEach((selector) => {
    const input = $(selector);
    input.min = local;
    input.value = local;
  });
  $('#staff-work-date').value = local;
}

function bindEvents() {
  bindCourtEvents(openBooking);
  $('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters = {
      sport: $('#sport-select').value,
      district: $('#district-select').value,
      q: $('#query-input').value.trim()
    };
    $$('.sport-chip').forEach((item) => item.classList.toggle('active', item.dataset.sport === state.filters.sport));
    loadCourts(true);
  });
  $('#menu-button').addEventListener('click', () => {
    const open = $('#main-nav').classList.toggle('open');
    $('#menu-button').setAttribute('aria-expanded', String(open));
  });

  $('#login-button').addEventListener('click', () => showDialog('login-dialog'));
  $('#login-form').addEventListener('submit', login);
  $('#register-form').addEventListener('submit', register);
  $('#open-register').addEventListener('click', () => {
    closeDialog('login-dialog');
    showDialog('register-dialog');
  });
  $('#profile-button').addEventListener('click', () => isCustomer() ? showDashboard() : showManagement());
  $('#logout-link').addEventListener('click', logout);

  $('#dashboard-link').addEventListener('click', showDashboard);
  $('#management-link').addEventListener('click', showManagement);
  $('#refresh-management').addEventListener('click', showManagement);
  $('#booking-date').addEventListener('change', loadSlots);
  $('#confirm-booking').addEventListener('click', createBooking);
  $('#pay-now').addEventListener('click', () => payBooking());
  $('#staff-booking-create').addEventListener('click', () => openBooking());
  $('#staff-work-date').addEventListener('change', showManagement);
  $('#offline-court').addEventListener('change', () => {
    const court = state.offlineCourts.find((item) => item.id === Number($('#offline-court').value));
    if (court) {
      selectBookingCourt(court);
      loadSlots();
    }
  });
  $('#management-create').addEventListener('click', openEntityForm);
  $('#entity-form').addEventListener('submit', submitEntity);

  $$('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(button.dataset.close));
  });
  $$('.dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  $$('[data-demo]').forEach((button) => {
    button.addEventListener('click', () => {
      $('#login-email').value = demoAccounts[button.dataset.demo][0];
      $('#login-password').value = demoAccounts[button.dataset.demo][1];
    });
  });
}

async function init() {
  $$('svg:not(.icon-sprite)').forEach((icon) => icon.setAttribute('aria-hidden', 'true'));
  setDefaultDates();
  bindEvents();
  try {
    const data = await api('/api/bootstrap');
    state.sports = data.sports;
    state.districts = data.districts;
    state.user = data.user;
    renderBootstrap();
    updateSessionUi();
    await loadCourts();
  } catch (error) {
    toast(`Không thể tải dữ liệu: ${error.message}`);
  }
}

await init();
