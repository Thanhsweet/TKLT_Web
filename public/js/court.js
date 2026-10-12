import { sportImage, icon } from "./ui.js";
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
  if (!Number.isInteger(id) || id < 1)
    throw Error("Vui lòng chọn một sân từ danh sách tìm sân.");
  const r = await fetch("/api/courts/" + id),
    d = await r.json();
  if (!r.ok) throw Error(d.error || "Không tải được sân.");
  const c = d.court,
    images = d.images || [],
    reviews = d.reviews || [],
    photo = images[0]?.image_url || c.image_url;
  let amenities = c.amenities || [];
  if (typeof amenities === "string") {
    try {
      amenities = JSON.parse(amenities);
    } catch {
      amenities = [];
    }
  }
  document.title = c.name + " | N01SPORT";
  el.innerHTML = `<nav class="breadcrumb" aria-label="Đường dẫn"><a href="/">Trang chủ</a><span aria-hidden="true">/</span><a href="/#courts">Tìm sân</a><span aria-hidden="true">/</span><span>${esc(c.sport_name)}</span></nav><div class="detail-title"><div><p class="eyebrow">${esc(c.venue_name)}</p><h1>${esc(c.name)}</h1><p>${esc(c.address)}, ${esc(c.district)}, ${esc(c.city)}</p></div><div class="detail-rating"><strong>${Number(c.rating || 0).toFixed(1)} / 5</strong><span>${Number(c.review_count || reviews.length)} đánh giá tại cơ sở</span></div></div>
  <figure class="detail-photo"><img src="${esc(photo || sportImage(c.sport_slug))}" data-fallback="${sportImage(c.sport_slug)}" alt="${esc(photo ? c.name : "Hình minh họa " + c.sport_name)}" width="1536" height="1024" fetchpriority="high"><figcaption class="photo-disclaimer" ${photo ? "hidden" : ""}>Hình ảnh minh họa bộ môn · Không phải ảnh thực tế của cơ sở</figcaption></figure>
  ${
    images.length > 1
      ? `<div class="gallery" aria-label="Ảnh cơ sở">${images
          .slice(1)
          .map(
            (i) =>
              `<img src="${esc(i.image_url)}" alt="${esc(i.alt_text || c.venue_name)}" width="280" height="180" loading="lazy">`,
          )
          .join("")}</div>`
      : ""
  }
  <div class="detail-columns"><div class="detail-info"><section class="panel"><h2>Không gian cho buổi chơi của bạn</h2><p class="muted">${esc(c.description || "Chọn khung giờ để xem giá và lịch trống của sân trước khi đặt.")}</p><dl class="detail-facts"><div><dt>Bộ môn</dt><dd>${esc(c.sport_name)}</dd></div><div><dt>Mặt sân</dt><dd>${esc(c.surface || "Đang cập nhật")}</dd></div><div><dt>Sức chứa</dt><dd>${Number(c.capacity)} người</dd></div><div><dt>Không gian</dt><dd>${c.indoor ? "Trong nhà" : "Ngoài trời"}</dd></div><div><dt>Giờ hoạt động</dt><dd>${esc(String(c.open_time).slice(0, 5))} – ${esc(String(c.close_time).slice(0, 5))}</dd></div><div><dt>Mỗi lượt chơi</dt><dd>${Number(c.slot_minutes)} phút</dd></div></dl></section>
  ${amenities.length ? `<section class="panel"><h2>Tiện ích tại cơ sở</h2><ul class="detail-amenities">${amenities.map((a) => `<li>${icon("building")}${esc(a)}</li>`).join("")}</ul></section>` : ""}
  <section class="panel"><h2>Đánh giá tại cơ sở</h2>${reviews.length ? reviews.map((v) => `<article class="detail-review"><strong>${esc(v.full_name)}</strong><span>${Number(v.rating)} / 5 điểm</span><p>${esc(v.comment || "Người chơi đã gửi đánh giá.")}</p></article>`).join("") : '<div class="detail-empty"><strong>Chưa có đánh giá cho cơ sở này</strong><p>Sau buổi chơi hoàn tất, bạn có thể chia sẻ trải nghiệm từ mục Lịch của tôi.</p></div>'}</section>
  <section class="panel"><h2>Trước khi bạn đặt sân</h2><p class="muted">Giá có thể thay đổi theo ngày và khung giờ. Mức giá của lượt chơi được hiển thị khi chọn giờ; hãy kiểm tra lại trước khi xác nhận.</p><p class="muted">Bạn có thể theo dõi đơn, thanh toán hoặc gửi yêu cầu hủy trong tài khoản. Việc hủy và hoàn tiền được xử lý theo trạng thái đơn.</p><a class="text-link" href="/policies.html">Xem điều khoản đặt sân →</a></section></div>
  <aside class="detail-booking"><small>Giá tham khảo từ</small><p class="detail-price">${Number(c.base_price).toLocaleString("vi-VN")}đ <span>/ ${Number(c.slot_minutes)} phút</span></p><a class="booking-link" href="/?court_id=${id}#courts">Xem lịch trống & đặt sân ${icon("arrow")}</a><p>Chọn ngày và khung giờ để xem giá chính xác. Lịch được kiểm tra lại khi tạo đơn.</p><a class="text-link" href="/account.html#bookings">Xem lịch đặt của tôi</a><div class="detail-help">Cần hỗ trợ? <a href="/account.html#support">Gửi yêu cầu</a></div></aside></div>`;
} catch (e) {
  el.innerHTML = `<div class="empty" role="alert">${icon("help")}<h1>Chưa thể hiển thị sân</h1><p>${esc(e.message)}</p><a class="text-link" href="/#courts">Quay lại tìm sân →</a></div>`;
}
