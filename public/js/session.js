import { state } from './core/state.js';
import { $ } from './core/dom.js';
import { formatter } from './core/format.js';

export function isCustomer() { return ['customer', 'coach'].includes(state.user?.role); }

export function isManagement() { return ['owner', 'admin', 'receptionist', 'technician', 'cleaner'].includes(state.user?.role); }

export function updateSessionUi() {
  const loggedIn = Boolean(state.user);
  $('#login-button').classList.toggle('hidden', loggedIn);
  $('#profile-button').classList.toggle('hidden', !loggedIn);
  $('#dashboard-link').classList.toggle('hidden', !loggedIn || !isCustomer());
  $('#management-link').classList.toggle('hidden', !loggedIn || !isManagement());
  $('#logout-link').classList.toggle('hidden', !loggedIn);
  if (loggedIn) {
    $('#profile-name').textContent = state.user.full_name.split(' ').slice(-2).join(' ');
    $('#profile-avatar').textContent = state.user.full_name.trim().charAt(0).toUpperCase();
    $('#loyalty-points').textContent = formatter.format(state.user.loyalty_points || 0);
  }
}
