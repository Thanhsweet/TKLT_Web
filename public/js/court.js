const el = document.querySelector("#court"),
  id = Number(new URLSearchParams(location.search).get("id"));
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
try {
  const r = await fetch("/api/courts/" + id),
    d = await r.json();
  if (!r.ok) throw Error(d.error);
  const c = d.court;
  document.title = c.name + " | N01SPORT";
  el.innerHTML = `<p class="eyebrow">${esc(c.sport_name)} / ${esc(c.venue_name)}</p><h1>${esc(c.name)}</h1><p>${esc(c.address)}, ${esc(c.district)}, ${esc(c.city)}</p><div class="gallery">${d.images.map((i) => `<img src="${esc(i.image_url)}" alt="${esc(i.alt_text)}" loading="lazy" width="280" height="180">`).join("")}</div><section class="panel"><h2>Thông tin sân</h2><p>${esc(c.description)}</p><p>Mặt sân: ${esc(c.surface)} · Sức chứa: ${c.capacity}<br>Giờ mở: ${esc(c.open_time)} – ${esc(c.close_time)}<br>Giá từ ${Number(c.base_price).toLocaleString("vi-VN")}đ / ${c.slot_minutes} phút</p><a href="/?court_id=${id}#courts">Xem lịch trống & đặt sân</a></section><section class="panel"><h2>Đánh giá từ người chơi</h2>${d.reviews.length ? d.reviews.map((v) => `<article class="conversation"><strong>${esc(v.full_name)} · ${v.rating}/5</strong><p>${esc(v.comment)}</p></article>`).join("") : "<p>Chưa có đánh giá.</p>"}</section>`;
} catch (e) {
  el.textContent = e.message;
}
