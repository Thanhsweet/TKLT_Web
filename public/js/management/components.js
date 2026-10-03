export function table(headers, rows) { return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`; }

export function actionButton(label, action, id, style = 'outline') { return `<button class="button button-${style}" type="button" data-action="${action}" data-id="${id}">${label}</button>`; }
