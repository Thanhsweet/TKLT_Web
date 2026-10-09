const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

import { state } from "./core/state.js";
import { openBooking, createBooking, loadSlots, selectBookingCourt } from "./bookings.js";
import { bindCourtEvents } from "./courts.js";

const demoAccounts = {
  customer: ["khach@n01sport.vn", "Khach@123"],
  owner: ["chusan@n01sport.vn", "ChuSan@123"],
  admin: ["admin@n01sport.vn", "Admin@123"],
  receptionist: ["letan@n01sport.vn", "LeTan@123"],
  technician: ["kythuat@n01sport.vn", "KyThuat@123"],
  cleaner: ["vesinh@n01sport.vn", "VeSinh@123"],
};

const formatter = new Intl.NumberFormat("vi-VN");
const money = (value) => `${formatter.format(Number(value || 0))}₫`;
const parseDate = (value) => new Date(String(value).replace(" ", "T"));
const dateTime = (value) =>
  new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseDate(value));
const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );

async function api(path, options = {}) {
  if (options.method && options.method !== "GET") {
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    options.headers = {
      ...(options.headers || {}),
      "X-CSRF-Token": csrf.token,
    };
  }
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Có lỗi xảy ra."), {
      status: response.status,
    });
  return data;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add("hidden"), 3500);
}

function showDialog(id) {
  const dialog = $(`#${id}`);
  if (!dialog.open) dialog.showModal();
}
function closeDialog(id) {
  const dialog = $(`#${id}`);
  if (dialog?.open) dialog.close();
}

function setDefaultDates() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  ["#date-input", "#booking-date"].forEach((selector) => {
    const input = $(selector);
    input.min = local;
    input.value = local;
  });
}

function sportCode(slug) {
  return (
    {
      "bong-da": "BĐ",
      "cau-long": "CL",
      tennis: "TN",
      "bong-ro": "BR",
      pickleball: "PB",
    }[slug] || "SP"
  );
}
function isCustomer() {
  return ["customer", "coach"].includes(state.user?.role);
}
function isManagement() {
  return ["owner", "admin", "receptionist", "technician", "cleaner"].includes(
    state.user?.role,
  );
}

function updateSessionUi() {
  const loggedIn = Boolean(state.user);
  $("#staff-booking-create").classList.toggle("hidden", state.user?.role !== "receptionist");
  $("#login-button").classList.toggle("hidden", loggedIn);
  $("#profile-button").classList.toggle("hidden", !loggedIn);
  $("#dashboard-link").classList.toggle("hidden", !loggedIn || !isCustomer());
  $("#management-link").classList.toggle(
    "hidden",
    !loggedIn || !isManagement(),
  );
  $("#logout-link").classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    $("#profile-name").textContent = state.user.full_name
      .split(" ")
      .slice(-2)
      .join(" ");
    $("#profile-avatar").textContent = state.user.full_name
      .trim()
      .charAt(0)
      .toUpperCase();
    $("#loyalty-points").textContent = formatter.format(
      state.user.loyalty_points || 0,
    );
  }
}

function renderBootstrap() {
  $("#sport-select").insertAdjacentHTML(
    "beforeend",
    state.sports
      .map(
        (s) =>
          `<option value="${escapeHtml(s.slug)}">${escapeHtml(s.name)}</option>`,
      )
      .join(""),
  );
  $("#district-select").insertAdjacentHTML(
    "beforeend",
    state.districts
      .map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)
      .join(""),
  );
  $("#sport-chips").innerHTML =
    `<button class="sport-chip active" type="button" data-sport=""><span class="sport-symbol">ALL</span>Tất cả</button>${state.sports.map((s) => `<button class="sport-chip" type="button" data-sport="${escapeHtml(s.slug)}"><span class="sport-symbol">${sportCode(s.slug)}</span>${escapeHtml(s.name)}</button>`).join("")}`;
  $$(".sport-chip").forEach((button) =>
    button.addEventListener("click", () => {
      $$(".sport-chip").forEach((item) =>
        item.classList.toggle("active", item === button),
      );
      $("#sport-select").value = button.dataset.sport;
      state.filters.sport = button.dataset.sport;
      loadCourts(true);
    }),
  );
}

function courtCard(court) {
  const amenities = court.amenities
    .slice(0, 3)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
  return `<article class="court-card">
    <div class="court-art ${escapeHtml(court.sport_slug)}">
      <span class="art-badge">${court.indoor ? "Trong nhà" : "Ngoài trời"}</span>
      <button class="favorite-button ${court.is_favorite ? "active" : ""}" type="button" data-favorite="${court.venue_id}" aria-label="${court.is_favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"}" aria-pressed="${court.is_favorite}"><svg><use href="#i-heart"/></svg></button>
      <span class="sport-monogram">${sportCode(court.sport_slug)}</span>
      ${court.image_url ? `<img class="court-photo" src="${escapeHtml(court.image_url)}" alt="${escapeHtml(court.venue_name)}" loading="lazy" width="400" height="220">` : ""}
    </div>
    <div class="court-body">
      <div class="court-title-row"><div><h3>${escapeHtml(court.name)}</h3><div class="venue-name">${escapeHtml(court.venue_name)} · ${escapeHtml(court.sport_name)}</div></div><span class="rating"><svg><use href="#i-star"/></svg>${court.rating}</span></div>
      <div class="court-location"><svg><use href="#i-pin"/></svg><span>${escapeHtml(court.address)}, ${escapeHtml(court.district)}</span></div>
      <div class="amenity-list">${amenities}</div>
      <p><a href="/court.html?id=${court.id}">Chi tiết sân</a>${court.distance_km !== undefined && court.distance_km !== null ? " · " + court.distance_km + " km" : ""}</p><div class="court-footer"><div class="price">Từ <strong>${money(court.base_price)} / ${court.slot_minutes} phút</strong></div><button class="button button-primary" type="button" data-book-court="${court.id}">Xem lịch <svg><use href="#i-arrow"/></svg></button></div>
    </div>
  </article>`;
}

function renderCourts() {
  $("#result-count").textContent = state.courts.length;
  $("#court-grid").innerHTML = state.courts.map(courtCard).join("");
  $("#court-grid").classList.toggle("hidden", !state.courts.length);
  $("#empty-state").classList.toggle("hidden", Boolean(state.courts.length));
  const active = [
    state.filters.sport &&
      state.sports.find((item) => item.slug === state.filters.sport)?.name,
    state.filters.district,
    state.filters.q && `“${state.filters.q}”`,
  ].filter(Boolean);
  $("#filter-summary").classList.toggle("hidden", !active.length);
  $("#filter-summary").textContent = active.length
    ? `Đang lọc: ${active.join(" · ")}`
    : "";
}

async function loadCourts(scroll = false) {
  $("#court-grid").innerHTML = Array.from(
    { length: 6 },
    () => '<div class="slot-skeleton court-skeleton"></div>',
  ).join("");
  const params = new URLSearchParams(
    Object.entries(state.filters).filter(([, value]) => value),
  );
  try {
    state.courts = (await api(`/api/courts?${params}`)).courts;
    renderCourts();
    if (scroll)
      $("#courts").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("#court-grid").innerHTML = "";
    toast(error.message);
  }
}

async function toggleFavorite(venueId) {
  if (!isCustomer()) {
    showDialog("login-dialog");
    return toast("Đăng nhập bằng tài khoản khách hàng để lưu sân yêu thích.");
  }
  try {
    const data = await api(`/api/venues/${venueId}/favorite`, {
      method: "POST",
      body: "{}",
    });
    state.courts
      .filter((c) => c.venue_id === venueId)
      .forEach((c) => {
        c.is_favorite = data.favorite;
      });
    renderCourts();
    toast(
      data.favorite
        ? "Đã thêm vào sân yêu thích."
        : "Đã bỏ khỏi sân yêu thích.",
    );
  } catch (error) {
    toast(error.message);
  }
}

async function payBooking(id = state.activeBooking?.id) {
  location.href = `/account.html#payment=${id}`;
  return;
  if (!id) return;
  const button = $("#pay-now");
  button.disabled = true;
  button.textContent = "Đang xử lý…";
  try {
    const data = await api(`/api/bookings/${id}/pay`, {
      method: "POST",
      body: "{}",
    });
    state.activeBooking = data.booking;
    closeDialog("success-dialog");
    toast("Thanh toán thành công, booking đã được xác nhận.");
    await showDashboard();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Thanh toán mô phỏng";
  }
}

function statusText(status) {
  return (
    {
      pending: "Chờ thanh toán",
      confirmed: "Đã xác nhận",
      checked_in: "Đang sử dụng",
      completed: "Hoàn tất",
      cancel_requested: "Chờ duyệt hủy",
      cancelled: "Đã hủy",
      expired: "Hết hạn",
      no_show: "Khách vắng",
      paid: "Đã thanh toán",
      active: "Hoạt động",
      inactive: "Ngừng hoạt động",
      maintenance: "Bảo trì",
      locked: "Đã khóa",
      suspended: "Tạm dừng",
      open: "Mới tạo",
      assigned: "Đã giao",
      in_progress: "Đang xử lý",
      waiting_approval: "Chờ duyệt",
      resolved: "Đã xử lý",
      closed: "Đã đóng",
      rejected: "Từ chối",
      approved: "Đã duyệt",
      refunded: "Đã hoàn",
      ready: "Sẵn sàng",
      needs_cleaning: "Cần vệ sinh",
      cleaning: "Đang vệ sinh",
      blocked: "Bị chặn",
    }[status] || status
  );
}

async function showDashboard() {
  location.href = "/account.html#bookings";
  return;
  if (!isCustomer()) return showDialog("login-dialog");
  try {
    const data = await api("/api/bookings");
    $("#booking-list").innerHTML = data.bookings.length
      ? data.bookings
          .map(
            (b) => `<article class="booking-item">
      <div><h3>${escapeHtml(b.court_name)}</h3><p>${escapeHtml(b.venue_name)} · ${escapeHtml(b.address)}</p><small>${escapeHtml(b.booking_code)}</small></div>
      <div class="booking-time">${dateTime(b.start_at)}<small>${money(b.total_amount)}</small></div><span class="status ${b.status}">${statusText(b.status)}</span>
      <div class="booking-actions">${b.payment_status !== "paid" && b.status === "pending" ? `<button class="button button-primary" data-pay="${b.id}" type="button">Thanh toán</button>` : ""}${["pending", "confirmed"].includes(b.status) ? `<button class="button button-outline" data-cancel="${b.id}" type="button">Yêu cầu hủy</button>` : ""}${b.status === "completed" ? `<button class="button button-outline" data-review="${b.id}" type="button">Đánh giá</button>` : ""}</div>
    </article>`,
          )
          .join("")
      : '<div class="empty-state"><h3>Bạn chưa có lịch đặt sân</h3><p>Chọn một sân phù hợp để bắt đầu.</p></div>';
    $$("[data-pay]").forEach((b) =>
      b.addEventListener("click", () => payBooking(Number(b.dataset.pay))),
    );
    $$("[data-cancel]").forEach((b) =>
      b.addEventListener("click", () =>
        cancelBooking(Number(b.dataset.cancel)),
      ),
    );
    $$("[data-review]").forEach((b) =>
      b.addEventListener("click", () =>
        reviewBooking(Number(b.dataset.review)),
      ),
    );
    $("#dashboard-section").classList.remove("hidden");
    $("#management-section").classList.add("hidden");
    $("#dashboard-section").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    toast(error.message);
  }
}

async function cancelBooking(id) {
  const reason = prompt("Nhập lý do hủy booking:");
  if (reason === null) return;
  try {
    const data = await api(`/api/bookings/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    toast(
      data.booking.status === "cancel_requested"
        ? "Đã gửi yêu cầu để chủ sân xét duyệt."
        : "Đã hủy booking.",
    );
    await showDashboard();
    await loadCourts();
  } catch (error) {
    toast(error.message);
  }
}

async function reviewBooking(id) {
  const rating = prompt("Chấm điểm từ 1 đến 5:");
  if (rating === null) return;
  const comment = prompt("Nhận xét của bạn:") ?? "";
  try {
    await api(`/api/bookings/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ rating: Number(rating), comment }),
    });
    toast("Cảm ơn bạn đã đánh giá.");
    await loadCourts();
  } catch (error) {
    toast(error.message);
  }
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}
function actionButton(label, action, id, style = "outline") {
  return `<button class="button button-${style}" type="button" data-action="${action}" data-id="${id}">${label}</button>`;
}

function roleTabs() {
  if (state.user.role === "owner")
    return [
      ["overview", "Tổng quan"],
      ["courts", "Sân"],
      ["promotions", "Khuyến mãi"],
      ["staff", "Nhân viên"],
      ["services", "Dịch vụ"],
      ["maintenance", "Bảo trì"],
      ["refunds", "Hủy và hoàn tiền"],
    ];
  if (state.user.role === "admin")
    return [
      ["users", "Tài khoản"],
      ["venues", "Địa điểm"],
      ["audit", "Nhật ký"],
    ];
  return [["work", "Công việc hôm nay"]];
}

function renderTabs() {
  const tabs = roleTabs();
  if (!tabs.some(([id]) => id === state.managementTab))
    state.managementTab = tabs[0][0];
  $("#management-tabs").innerHTML = tabs
    .map(
      ([id, label]) =>
        `<button class="management-tab ${state.managementTab === id ? "active" : ""}" type="button" role="tab" aria-selected="${state.managementTab === id}" data-management-tab="${id}">${label}</button>`,
    )
    .join("");
  $$("[data-management-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      state.managementTab = button.dataset.managementTab;
      renderManagementView();
    }),
  );
}

function renderOwnerView(data) {
  const tab = state.managementTab;
  const createTabs = ["courts", "promotions", "staff", "services"];
  $("#management-create").classList.toggle("hidden", !createTabs.includes(tab));
  if (tab === "overview") {
    $("#table-title").textContent = "Đơn đặt sân gần đây";
    $("#management-table").innerHTML = table(
      ["Mã đơn", "Khách hàng", "Sân", "Thời gian", "Giá trị", "Trạng thái"],
      data.recent.map(
        (b) =>
          `<tr><td><strong>${escapeHtml(b.booking_code)}</strong></td><td>${escapeHtml(b.full_name)}</td><td>${escapeHtml(b.court_name)}</td><td>${dateTime(b.start_at)}</td><td>${money(b.total_amount)}</td><td><span class="status ${b.status}">${statusText(b.status)}</span></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      `<div class="panel-heading"><h3>Hiệu suất sân</h3><span>Theo lượt đặt</span></div><ul class="side-list">${data.courts.map((c) => `<li><div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.venue_name)}</small></div><strong>${c.booking_count}</strong></li>`).join("")}</ul>`;
  } else if (tab === "courts") {
    $("#table-title").textContent = "Danh mục sân";
    $("#management-table").innerHTML = table(
      ["Sân", "Địa điểm", "Bộ môn", "Giá cơ bản", "Tình trạng", "Thao tác"],
      data.courts.map(
        (c) =>
          `<tr><td><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.surface)}</small></td><td>${escapeHtml(c.venue_name)}</td><td>${escapeHtml(c.sport_name)}</td><td>${money(c.base_price)}</td><td><span class="status ${c.status}">${statusText(c.status)}</span></td><td><div class="row-actions">${actionButton(c.status === "active" ? "Ngừng sân" : "Mở sân", "toggle-court", c.id, c.status === "active" ? "danger" : "outline")}</div></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Quy tắc</h3></div><ul class="side-list"><li><div><strong>Ngừng sân</strong><small>Không xóa lịch sử và booking đã có.</small></div></li><li><div><strong>Giá mới</strong><small>Không thay đổi số tiền booking đã chốt.</small></div></li></ul>';
  } else if (tab === "promotions") {
    $("#table-title").textContent = "Chương trình khuyến mãi";
    $("#management-table").innerHTML = table(
      ["Mã", "Tên", "Mức giảm", "Điều kiện", "Thời hạn", "Trạng thái"],
      data.promotions.map(
        (p) =>
          `<tr><td><strong>${escapeHtml(p.code)}</strong></td><td>${escapeHtml(p.name)}</td><td>${p.discount_type === "percent" ? `${p.discount_value}%` : money(p.discount_value)}</td><td>Từ ${money(p.min_order_value)}</td><td>${dateTime(p.starts_at)}<br>${dateTime(p.ends_at)}</td><td><span class="status ${p.active ? "active" : "inactive"}">${p.active ? "Hoạt động" : "Đã tắt"}</span></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Mã mẫu</h3></div><ul class="side-list"><li><strong>CHAOSAN</strong><small>Giảm 10% lần đầu</small></li><li><strong>NHOMVUI</strong><small>Giảm 30.000₫</small></li></ul>';
  } else if (tab === "staff") {
    $("#table-title").textContent = "Nhân viên và phân công";
    $("#management-table").innerHTML = table(
      ["Nhân viên", "Liên hệ", "Vị trí", "Cơ sở", "Trạng thái"],
      data.staff.map(
        (u) =>
          `<tr><td><strong>${escapeHtml(u.full_name)}</strong></td><td>${escapeHtml(u.email)}<br>${escapeHtml(u.phone || "")}</td><td>${escapeHtml(u.position)}</td><td>${escapeHtml(u.venue_name)}</td><td><span class="status ${u.status}">${statusText(u.status)}</span></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Nhóm vận hành</h3></div><ul class="side-list"><li><strong>Lễ tân</strong><small>Check-in, hoàn tất booking</small></li><li><strong>Kỹ thuật</strong><small>Xử lý sự cố, bảo trì</small></li><li><strong>Vệ sinh</strong><small>Bàn giao sân sẵn sàng</small></li></ul>';
  } else if (tab === "services") {
    $("#table-title").textContent = "Dịch vụ và tồn kho";
    $("#management-table").innerHTML = table(
      ["Dịch vụ", "Loại", "Địa điểm", "Giá", "Tồn kho", "Trạng thái"],
      data.services.map(
        (s) =>
          `<tr><td><strong>${escapeHtml(s.name)}</strong></td><td>${escapeHtml(s.type)}</td><td>${escapeHtml(s.venue_name)}</td><td>${money(s.price)} / ${escapeHtml(s.unit)}</td><td>${s.stock_quantity}</td><td><span class="status ${s.active ? "active" : "inactive"}">${s.active ? "Đang bán" : "Đã tắt"}</span></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Loại dịch vụ</h3></div><ul class="side-list"><li><strong>Bán hàng</strong><small>Trừ tồn khi giao</small></li><li><strong>Cho thuê</strong><small>Ghi nhận bàn giao và trả đồ</small></li><li><strong>Kỹ thuật</strong><small>Gắn yêu cầu với booking</small></li></ul>';
  } else if (tab === "maintenance") {
    $("#table-title").textContent = "Yêu cầu bảo trì";
    $("#management-table").innerHTML = table(
      ["Sân", "Nội dung", "Ưu tiên", "Phụ trách", "Trạng thái", "Thao tác"],
      data.maintenance.map(
        (m) =>
          `<tr><td>${escapeHtml(m.court_name)}</td><td><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(m.description)}</small></td><td>${escapeHtml(m.priority)}</td><td>${escapeHtml(m.assigned_name || "Chưa giao")}</td><td><span class="status ${m.status}">${statusText(m.status)}</span></td><td><div class="row-actions">${!["closed", "rejected"].includes(m.status) ? actionButton("Duyệt xử lý", "approve-maintenance", m.id) : ""}</div></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Ảnh hưởng lịch sân</h3></div><ul class="side-list"><li><div><strong>Khoảng bảo trì</strong><small>Hệ thống chặn mọi booking mới bị trùng.</small></div></li></ul>';
  } else if (tab === "refunds") {
    $("#table-title").textContent = "Yêu cầu hủy và hoàn tiền";
    $("#management-table").innerHTML = table(
      ["Booking", "Khách hàng", "Lý do", "Số tiền", "Trạng thái", "Thao tác"],
      data.refunds.map(
        (r) =>
          `<tr><td><strong>${escapeHtml(r.booking_code)}</strong></td><td>${escapeHtml(r.full_name)}</td><td>${escapeHtml(r.reason)}</td><td>${money(r.requested_amount)}</td><td><span class="status ${r.status}">${statusText(r.status)}</span></td><td><div class="row-actions">${r.status === "pending" ? `${actionButton("Duyệt", "approve-refund", r.id)}${actionButton("Từ chối", "reject-refund", r.id, "danger")}` : ""}${r.status === "approved" ? actionButton("Đã hoàn tiền", "finish-refund", r.id) : ""}</div></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Chính sách mẫu</h3></div><ul class="side-list"><li><div><strong>Chủ sân duyệt</strong><small>Khoản hoàn thực hiện thủ công và có nhật ký.</small></div></li></ul>';
  }
}

function renderAdminView(data) {
  $("#management-create").classList.toggle(
    "hidden",
    state.managementTab !== "users",
  );
  if (state.managementTab === "users") {
    $("#table-title").textContent = "Tài khoản hệ thống";
    $("#management-table").innerHTML = table(
      ["Họ tên", "Email", "Vai trò", "Trạng thái", "Thao tác"],
      data.users.map(
        (u) =>
          `<tr><td><strong>${escapeHtml(u.full_name)}</strong></td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td><span class="status ${u.status}">${statusText(u.status)}</span></td><td><div class="row-actions">${u.role !== "admin" ? actionButton(u.status === "active" ? "Khóa" : "Mở khóa", "toggle-user", u.id, u.status === "active" ? "danger" : "outline") : ""}</div></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Phân quyền</h3></div><ul class="side-list"><li><div><strong>Khóa tài khoản</strong><small>Phiên đăng nhập hiện tại bị vô hiệu hóa.</small></div></li></ul>';
  } else if (state.managementTab === "venues") {
    $("#table-title").textContent = "Cụm sân đăng ký";
    $("#management-table").innerHTML = table(
      ["Địa điểm", "Chủ sân", "Khu vực", "Đánh giá", "Trạng thái", "Thao tác"],
      data.venues.map(
        (v) =>
          `<tr><td><strong>${escapeHtml(v.name)}</strong></td><td>${escapeHtml(v.owner_name)}</td><td>${escapeHtml(v.district)}, ${escapeHtml(v.city)}</td><td>${v.rating}/5</td><td><span class="status ${v.status}">${statusText(v.status)}</span></td><td><div class="row-actions">${v.status !== "active" ? actionButton("Duyệt", "activate-venue", v.id) : actionButton("Tạm dừng", "suspend-venue", v.id, "danger")}</div></td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Kiểm duyệt</h3></div><ul class="side-list"><li><div><strong>Địa điểm tạm dừng</strong><small>Không xuất hiện trong kết quả tìm kiếm.</small></div></li></ul>';
  } else {
    $("#table-title").textContent = "Nhật ký quản trị";
    $("#management-table").innerHTML = table(
      ["Thời gian", "Người thực hiện", "Hành động", "Đối tượng", "Mã"],
      data.audit.map(
        (a) =>
          `<tr><td>${dateTime(a.created_at)}</td><td>${escapeHtml(a.actor_name || "Hệ thống")}</td><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.entity_type)}</td><td>${a.entity_id || "—"}</td></tr>`,
      ),
    );
    $("#side-panel").innerHTML =
      '<div class="panel-heading"><h3>Audit log</h3></div><ul class="side-list"><li><div><strong>Không chỉnh sửa</strong><small>Lưu dấu vết thao tác quản trị và vận hành.</small></div></li></ul>';
  }
}

function renderStaffView(data) {
  $("#management-create").classList.toggle(
    "hidden",
    state.user.role !== "receptionist" && state.user.role !== "technician",
  );
  const roleName = {
    receptionist: "Lễ tân",
    technician: "Kỹ thuật",
    cleaner: "Vệ sinh",
  }[data.role];
  $("#table-title").textContent = `Công việc ${roleName}`;
  if (data.role === "receptionist")
    $("#management-table").innerHTML = table(
      [
        "Booking",
        "Khách",
        "Sân",
        "Thời gian",
        "Thanh toán",
        "Trạng thái",
        "Thao tác",
      ],
      data.work.map(
        (b) =>
          `<tr><td><strong>${escapeHtml(b.booking_code)}</strong></td><td>${escapeHtml(b.full_name)}</td><td>${escapeHtml(b.court_name)}</td><td>${dateTime(b.start_at)}</td><td>${statusText(b.payment_status)}</td><td><span class="status ${b.status}">${statusText(b.status)}</span></td><td><div class="row-actions">${b.status === "confirmed" ? `${actionButton("Check-in", "check-in", b.id)}${actionButton("Vắng", "no-show", b.id, "danger")}` : ""}${b.status === "checked_in" ? actionButton("Hoàn tất", "complete-booking", b.id) : ""}</div></td></tr>`,
      ),
    );
  if (data.role === "technician")
    $("#management-table").innerHTML = table(
      ["Sân", "Yêu cầu", "Ưu tiên", "Trạng thái", "Thao tác"],
      data.work.map(
        (m) =>
          `<tr><td>${escapeHtml(m.court_name)}</td><td><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(m.description)}</small></td><td>${escapeHtml(m.priority)}</td><td><span class="status ${m.status}">${statusText(m.status)}</span></td><td><div class="row-actions">${["open", "assigned"].includes(m.status) ? actionButton("Nhận việc", "maintenance-start", m.id) : ""}${m.status === "in_progress" ? actionButton("Hoàn thành", "maintenance-done", m.id) : ""}</div></td></tr>`,
      ),
    );
  if (data.role === "cleaner")
    $("#management-table").innerHTML = table(
      ["Sân", "Thời gian", "Trạng thái", "Ghi chú", "Thao tác"],
      data.work.map(
        (t) =>
          `<tr><td>${escapeHtml(t.court_name)}</td><td>${dateTime(t.scheduled_at)}</td><td><span class="status ${t.status}">${statusText(t.status)}</span></td><td>${escapeHtml(t.issue_note || "")}</td><td><div class="row-actions">${["pending", "assigned"].includes(t.status) ? actionButton("Bắt đầu", "cleaning-start", t.id) : ""}${t.status === "in_progress" ? `${actionButton("Đã xong", "cleaning-done", t.id)}${actionButton("Báo sự cố", "cleaning-blocked", t.id, "danger")}` : ""}</div></td></tr>`,
      ),
    );
  $("#side-panel").innerHTML =
    `<div class="panel-heading"><h3>Ca làm</h3><span>${data.assignments.length} phân công</span></div><ul class="side-list">${data.assignments.map((a) => `<li><div><strong>${escapeHtml(a.venue_name)}</strong><small>${dateTime(a.shift_start)} – ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(parseDate(a.shift_end))}</small></div></li>`).join("")}</ul>`;
}

function bindRowActions() {
  $$("[data-action]").forEach((button) =>
    button.addEventListener("click", () =>
      runAction(button.dataset.action, Number(button.dataset.id)),
    ),
  );
}

function renderManagementView() {
  renderTabs();
  const data = state.managementData;
  if (state.user.role === "owner") renderOwnerView(data);
  else if (state.user.role === "admin") renderAdminView(data);
  else renderStaffView(data);
  bindRowActions();
}

async function showManagement() {
  location.href = "/account.html";
  return;
  if (!isManagement()) return showDialog("login-dialog");
  try {
    const isStaff = ["receptionist", "technician", "cleaner"].includes(
      state.user.role,
    );
    const data = await api(
      state.user.role === "owner"
        ? "/api/owner/dashboard"
        : state.user.role === "admin"
          ? "/api/admin/dashboard"
          : "/api/staff/dashboard",
    );
    state.managementData = data;
    const labels = {
      owner: ["VẬN HÀNH CHỦ SÂN", "Trung tâm quản lý"],
      admin: ["QUẢN TRỊ HỆ THỐNG", "Tổng quan nền tảng"],
      receptionist: ["VẬN HÀNH LỄ TÂN", "Booking hôm nay"],
      technician: ["VẬN HÀNH KỸ THUẬT", "Yêu cầu kỹ thuật"],
      cleaner: ["VẬN HÀNH VỆ SINH", "Bàn giao sân"],
    }[state.user.role];
    $("#management-eyebrow").textContent = labels[0];
    $("#management-title").textContent = labels[1];
    const metrics =
      state.user.role === "owner"
        ? [
            ["Sân quản lý", data.metrics.courts],
            ["Lịch sắp tới", data.metrics.upcoming_bookings],
            ["Đã xác nhận", data.metrics.confirmed],
            ["Đã thu", money(data.metrics.collected)],
          ]
        : state.user.role === "admin"
          ? [
              ["Người dùng", data.metrics.users],
              ["Cụm sân", data.metrics.venues],
              ["Sân thi đấu", data.metrics.courts],
              ["Đã thu", money(data.metrics.collected)],
            ]
          : [
              ["Ca làm", data.assignments.length],
              ["Công việc", data.work.length],
              ["Vai trò", labels[0].replace("VẬN HÀNH ", "")],
              [
                "Ngày làm việc",
                new Intl.DateTimeFormat("vi-VN").format(new Date()),
              ],
            ];
    $("#metrics-grid").innerHTML = metrics
      .map(
        ([label, value]) =>
          `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`,
      )
      .join("");
    if (isStaff) state.managementTab = "work";
    else if (!roleTabs().some(([id]) => id === state.managementTab))
      state.managementTab = roleTabs()[0][0];
    renderManagementView();
    $("#management-section").classList.remove("hidden");
    $("#dashboard-section").classList.add("hidden");
    $("#management-section").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    toast(error.message);
  }
}

async function runAction(action, id) {
  try {
    if (action === "toggle-court") {
      const item = state.managementData.courts.find((x) => x.id === id);
      await api(`/api/owner/courts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: item.status === "active" ? "inactive" : "active",
        }),
      });
    }
    if (action === "approve-maintenance")
      await api(`/api/owner/maintenance/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress" }),
      });
    if (action === "approve-refund")
      await api(`/api/owner/refunds/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
      });
    if (action === "reject-refund")
      await api(`/api/owner/refunds/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "rejected",
          review_note: "Không đủ điều kiện hoàn tiền",
        }),
      });
    if (action === "finish-refund")
      await api(`/api/owner/refunds/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "refunded" }),
      });
    if (action === "toggle-user") {
      const item = state.managementData.users.find((x) => x.id === id);
      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: item.status === "active" ? "locked" : "active",
        }),
      });
    }
    if (action === "activate-venue")
      await api(`/api/admin/venues/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
    if (action === "suspend-venue")
      await api(`/api/admin/venues/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "suspended" }),
      });
    if (["check-in", "no-show", "complete-booking"].includes(action))
      await api(`/api/staff/bookings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: {
            "check-in": "checked_in",
            "no-show": "no_show",
            "complete-booking": "completed",
          }[action],
        }),
      });
    if (["maintenance-start", "maintenance-done"].includes(action))
      await api(`/api/staff/maintenance/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: action === "maintenance-start" ? "in_progress" : "resolved",
        }),
      });
    if (
      ["cleaning-start", "cleaning-done", "cleaning-blocked"].includes(action)
    )
      await api(`/api/staff/cleaning/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: {
            "cleaning-start": "in_progress",
            "cleaning-done": "completed",
            "cleaning-blocked": "blocked",
          }[action],
          issue_note:
            action === "cleaning-blocked"
              ? "Cần lễ tân hoặc kỹ thuật kiểm tra"
              : "",
        }),
      });
    toast("Đã cập nhật dữ liệu.");
    await showManagement();
  } catch (error) {
    toast(error.message);
  }
}

function field(name, label, type = "text", options = null, full = false) {
  const optionHtml = options
    ? `<select name="${name}" required>${options.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("")}</select>`
    : `<input name="${name}" type="${type}" ${type !== "checkbox" ? "required" : ""}>`;
  return `<label class="${full ? "field-full" : ""}"><span>${label}</span>${optionHtml}</label>`;
}

function venueOptions() {
  return [
    ...new Map(
      (state.managementData.courts || []).map((c) => [
        String(c.venue_id),
        c.venue_name,
      ]),
    ).entries(),
  ];
}

function openEntityForm() {
  const tab = state.managementTab;
  let config;
  if (state.user.role === "owner" && tab === "courts")
    config = {
      title: "Thêm sân",
      endpoint: "/api/owner/courts",
      fields:
        field("venue_id", "Địa điểm", "text", venueOptions()) +
        field(
          "sport_id",
          "Bộ môn",
          "text",
          state.sports.map((s) => [String(s.id), s.name]),
        ) +
        field("name", "Tên sân") +
        field("surface", "Mặt sân") +
        field("capacity", "Sức chứa", "number") +
        field("base_price", "Giá cơ bản", "number") +
        field("slot_minutes", "Thời lượng slot", "text", [
          ["30", "30 phút"],
          ["60", "60 phút"],
          ["90", "90 phút"],
          ["120", "120 phút"],
        ]),
    };
  if (state.user.role === "owner" && tab === "promotions")
    config = {
      title: "Tạo khuyến mãi",
      endpoint: "/api/owner/promotions",
      fields:
        field("code", "Mã khuyến mãi") +
        field("name", "Tên chương trình") +
        field("discount_type", "Loại giảm", "text", [
          ["percent", "Phần trăm"],
          ["fixed", "Số tiền"],
        ]) +
        field("discount_value", "Giá trị giảm", "number") +
        field("min_order_value", "Đơn tối thiểu", "number") +
        field("max_discount", "Giảm tối đa", "number") +
        field("starts_at", "Bắt đầu", "datetime-local") +
        field("ends_at", "Kết thúc", "datetime-local"),
    };
  if (state.user.role === "owner" && tab === "staff")
    config = {
      title: "Tạo nhân viên",
      endpoint: "/api/owner/staff",
      fields:
        field("venue_id", "Cơ sở", "text", venueOptions()) +
        field("position", "Vị trí", "text", [
          ["receptionist", "Lễ tân"],
          ["technician", "Kỹ thuật"],
          ["cleaner", "Vệ sinh"],
        ]) +
        field("full_name", "Họ tên") +
        field("email", "Email", "email") +
        field("phone", "Số điện thoại", "tel") +
        field("password", "Mật khẩu", "password") +
        field("shift_start", "Bắt đầu ca", "datetime-local") +
        field("shift_end", "Kết thúc ca", "datetime-local"),
    };
  if (state.user.role === "owner" && tab === "services")
    config = {
      title: "Thêm dịch vụ",
      endpoint: "/api/owner/services",
      fields:
        field("venue_id", "Cơ sở", "text", venueOptions()) +
        field("type", "Loại", "text", [
          ["sale", "Bán hàng"],
          ["rental", "Cho thuê"],
          ["technical", "Kỹ thuật"],
        ]) +
        field("name", "Tên dịch vụ") +
        field("unit", "Đơn vị") +
        field("price", "Đơn giá", "number") +
        field("stock_quantity", "Tồn kho", "number"),
    };
  if (state.user.role === "admin")
    config = {
      title: "Tạo tài khoản vận hành",
      endpoint: "/api/admin/users",
      fields:
        field("role", "Vai trò", "text", [
          ["owner", "Chủ sân"],
          ["receptionist", "Lễ tân"],
          ["technician", "Kỹ thuật"],
          ["cleaner", "Vệ sinh"],
        ]) +
        field("full_name", "Họ tên") +
        field("email", "Email", "email") +
        field("phone", "Số điện thoại", "tel") +
        field("password", "Mật khẩu", "password"),
    };
  if (state.user.role === "technician" || state.user.role === "receptionist")
    config = {
      title: "Báo sự cố kỹ thuật",
      endpoint: "/api/staff/maintenance",
      fields:
        field("court_id", "Mã sân", "number") +
        field("priority", "Mức ưu tiên", "text", [
          ["low", "Thấp"],
          ["medium", "Trung bình"],
          ["high", "Cao"],
          ["urgent", "Khẩn cấp"],
        ]) +
        field("title", "Tiêu đề", "text", null, true) +
        field("description", "Mô tả", "text", null, true),
    };
  if (!config) return;
  state.entityConfig = config;
  $("#entity-title").textContent = config.title;
  $("#entity-fields").innerHTML = config.fields;
  $("#entity-error").classList.add("hidden");
  showDialog("entity-dialog");
}

async function submitEntity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const errorBox = $("#entity-error");
  const payload = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  errorBox.classList.add("hidden");
  try {
    await api(state.entityConfig.endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    closeDialog("entity-dialog");
    form.reset();
    toast("Đã thêm dữ liệu mới.");
    await showManagement();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
}

async function login(event) {
  event.preventDefault();
  const button = $('#login-form button[type="submit"]');
  const error = $("#login-error");
  error.classList.add("hidden");
  button.disabled = true;
  button.textContent = "Đang đăng nhập…";
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("#login-email").value,
        password: $("#login-password").value,
      }),
    });
    state.user = data.user;
    updateSessionUi();
    closeDialog("login-dialog");
    toast(`Xin chào ${state.user.full_name}.`);
    await loadCourts();
    if (isManagement()) showManagement();
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Đăng nhập";
  }
}

async function register(event) {
  event.preventDefault();
  const button = $('#register-form button[type="submit"]');
  const error = $("#register-error");
  error.classList.add("hidden");
  button.disabled = true;
  try {
    await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        full_name: $("#register-name").value,
        email: $("#register-email").value,
        phone: $("#register-phone").value,
        password: $("#register-password").value,
      }),
    });
    closeDialog("register-dialog");
    $("#login-email").value = $("#register-email").value;
    showDialog("login-dialog");
    toast("Đăng ký thành công. Hãy đăng nhập.");
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  state.user = null;
  state.managementData = null;
  updateSessionUi();
  $("#dashboard-section").classList.add("hidden");
  $("#management-section").classList.add("hidden");
  await loadCourts();
  toast("Bạn đã đăng xuất.");
}

function bindEvents() {
  bindCourtEvents(openBooking);
  $("#staff-booking-create").addEventListener("click", () => openBooking());
  $("#offline-court").addEventListener("change", async () => {
    const court = state.offlineCourts.find((c) => c.id === Number($("#offline-court").value));
    if (court) { selectBookingCourt(court); await loadSlots(); }
  });
  $("#search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.filters = {
      sport: $("#sport-select").value,
      district: $("#district-select").value,
      q: $("#query-input").value.trim(),
    };
    $$(".sport-chip").forEach((item) =>
      item.classList.toggle(
        "active",
        item.dataset.sport === state.filters.sport,
      ),
    );
    loadCourts(true);
  });
  $("#menu-button").addEventListener("click", () => {
    const open = $("#main-nav").classList.toggle("open");
    $("#menu-button").setAttribute("aria-expanded", String(open));
  });
  $("#login-button").addEventListener("click", () =>
    showDialog("login-dialog"),
  );
  $("#login-form").addEventListener("submit", login);
  $("#register-form").addEventListener("submit", register);
  $("#open-register").addEventListener("click", () => {
    closeDialog("login-dialog");
    showDialog("register-dialog");
  });
  $("#dashboard-link").addEventListener("click", showDashboard);
  $("#management-link").addEventListener("click", showManagement);
  $("#refresh-management").addEventListener("click", showManagement);
  $("#profile-button").addEventListener("click", () =>
    isCustomer() ? showDashboard() : showManagement(),
  );
  $("#logout-link").addEventListener("click", logout);
  $("#booking-date").addEventListener("change", loadSlots);
  $("#confirm-booking").addEventListener("click", createBooking);
  $("#pay-now").addEventListener("click", () => payBooking());
  $("#management-create").addEventListener("click", openEntityForm);
  $("#entity-form").addEventListener("submit", submitEntity);
  $$("[data-close]").forEach((button) =>
    button.addEventListener("click", () => closeDialog(button.dataset.close)),
  );
  $$(".dialog").forEach((dialog) =>
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    }),
  );
  $$("[data-demo]").forEach((button) =>
    button.addEventListener("click", () => {
      $("#login-email").value = demoAccounts[button.dataset.demo][0];
      $("#login-password").value = demoAccounts[button.dataset.demo][1];
    }),
  );
}

async function init() {
  const config = await api("/api/config").catch(() => ({ demo: false }));
  document
    .querySelector(".demo-accounts")
    ?.classList.toggle("hidden", !config.demo);
  $$("svg:not(.icon-sprite)").forEach((icon) =>
    icon.setAttribute("aria-hidden", "true"),
  );
  setDefaultDates();
  bindEvents();
  $("#nearby").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Trình duyệt chưa hỗ trợ vị trí.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.filters.lat = pos.coords.latitude;
        state.filters.lng = pos.coords.longitude;
        loadCourts(true);
      },
      () =>
        toast("Không lấy được vị trí. Hãy cấp quyền hoặc tìm theo khu vực."),
    );
  });
  try {
    const data = await api("/api/bootstrap");
    state.sports = data.sports;
    state.districts = data.districts;
    state.user = data.user;
    renderBootstrap();
    updateSessionUi();
    await loadCourts();
    const id = Number(new URLSearchParams(location.search).get("court_id"));
    if (id && state.courts.some((c) => c.id === id)) openBooking(id);
  } catch (error) {
    toast(`Không thể tải dữ liệu: ${error.message}`);
  }
}

export const ready = init();
