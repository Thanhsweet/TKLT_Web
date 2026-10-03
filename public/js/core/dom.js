export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function toast(message) {
  const element = $('#toast');
  element.textContent = message; element.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.add('hidden'), 3500);
}

export function showDialog(id) { const dialog = $(`#${id}`); if (!dialog.open) dialog.showModal(); }

export function closeDialog(id) { const dialog = $(`#${id}`); if (dialog?.open) dialog.close(); }
