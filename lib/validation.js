export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function text(value, label, max = 255, min = 1) {
  const s = String(value ?? "").trim();
  if (s.length < min || s.length > max)
    fail(`${label}: cần ${min}–${max} ký tự.`);
  return s;
}
export function integer(value, label, min = 0, max = 1000000000) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    fail(`${label} không hợp lệ.`);
  return n;
}
export function choice(value, options, label) {
  if (!options.includes(value)) fail(`${label} không hợp lệ.`);
  return value;
}
export function dateTime(value) {
  let s = String(value || "")
    .replace("T", " ")
    .slice(0, 19);
  if (s.length === 16) s += ":00";
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s))
    fail("Ngày giờ không hợp lệ.");
  const d = new Date(s.replace(" ", "T") + "+07:00");
  if (!Number.isFinite(d.getTime())) fail("Ngày giờ không hợp lệ.");
  const actual = new Date(d.getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  if (actual !== s) fail("Ngày giờ không tồn tại.");
  return s;
}
export function validateSlot(court, start, end, now = Date.now()) {
  const a = dateTime(start),
    b = dateTime(end);
  const at = new Date(a.replace(" ", "T") + "+07:00").getTime();
  const bt = new Date(b.replace(" ", "T") + "+07:00").getTime();
  if (at <= now || at > now + 180 * 86400000)
    fail("Chỉ đặt giờ trong tương lai, tối đa 180 ngày.");
  const opening = String(court.open_time).slice(0, 8),
    closing = String(court.close_time).slice(0, 8);
  if (
    a.slice(0, 10) !== b.slice(0, 10) ||
    a.slice(11) < opening ||
    b.slice(11) > closing
  )
    fail("Khung giờ nằm ngoài giờ hoạt động.");
  const minutes = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  if (
    bt - at !== Number(court.slot_minutes) * 60000 ||
    (minutes(a.slice(11)) - minutes(opening)) % Number(court.slot_minutes) !==
      0 ||
    a.slice(17) !== "00"
  )
    fail("Khung giờ phải đúng slot của sân.");
  return [a, b];
}
