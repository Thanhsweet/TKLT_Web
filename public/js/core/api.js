export async function api(path, options = {}) {
  if (options.method && options.method !== 'GET') {
    const csrf = await fetch('/api/csrf', { credentials: 'same-origin' }).then((r) => r.json());
    options.headers = { ...(options.headers || {}), 'X-CSRF-Token': csrf.token };
  }
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Có lỗi xảy ra.'), { status: response.status });
  return data;
}
