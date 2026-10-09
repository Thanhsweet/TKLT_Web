import { state } from '../../public/js/core/state.js';

const initialState = structuredClone(state);

export function frontend(t, respond = () => ({})) {
  Object.assign(state, structuredClone(initialState));
  const elements = new Map(), calls = [];
  const element = (selector) => {
    if (!elements.has(selector)) {
      const classes = new Set(), listeners = new Map();
      elements.set(selector, {
        value: '', textContent: '', innerHTML: '', disabled: false, open: false,
        classList: {
          toggle(name, on = !classes.has(name)) { if (on) classes.add(name); else classes.delete(name); return on; },
          contains: (name) => classes.has(name), add: (name) => classes.add(name), remove: (name) => classes.delete(name)
        },
        reportValidity: () => true,
        showModal() { this.open = true; }, close() { this.open = false; },
        scrollIntoView() {}, setAttribute() {},
        insertAdjacentHTML(position, html) { this.innerHTML += html; },
        addEventListener(name, handler) { listeners.set(name, handler); },
        dispatch(name, event = {}) { return listeners.get(name)?.(event); }
      });
    }
    return elements.get(selector);
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  globalThis.location = { search: '', hash: '', href: '' };
  globalThis.document = { querySelector: element, querySelectorAll: () => [] };
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
    if (locationDescriptor) Object.defineProperty(globalThis, 'location', locationDescriptor);
    else delete globalThis.location;
    Object.assign(state, structuredClone(initialState));
  });
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({ path, options });
    const data = path === '/api/csrf' ? { token: 'test-csrf' } : await respond(path, options);
    return { ok: true, status: 200, json: async () => data };
  });
  t.mock.method(globalThis, 'setTimeout', () => 0);
  element('#booking-date').min = '2030-01-01';
  element('#staff-work-date').value = '2030-01-02';
  return { state, element, calls };
}

export function dashboardData(role) {
  return {
    role, date: '2030-01-02', assignments: [], work: [], recent: [], courts: [],
    promotions: [], staff: [], services: [], maintenance: [], refunds: [], users: [], venues: [], audit: [],
    metrics: { courts: 0, upcoming_bookings: 0, confirmed: 0, collected: 0, users: 0, venues: 0 }
  };
}
