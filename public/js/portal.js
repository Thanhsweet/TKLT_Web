import { icon } from "./ui.js";
const $ = (s) => document.querySelector(s),
  view = $("#view"),
  actions = $("#actions");
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (v) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    Number(v || 0),
  );
const time = (v) =>
  v
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(
        new Date(
          String(v).replace(" ", "T") +
            (String(v).includes("Z") ? "" : "+07:00"),
        ),
      )
    : "—";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );
const labels = {
  pending: "Chờ thanh toán",
  confirmed: "Đã xác nhận",
  checked_in: "Đang chơi",
  completed: "Hoàn tất",
  cancel_requested: "Chờ duyệt hủy",
  cancelled: "Đã hủy",
  expired: "Hết hạn",
  no_show: "Khách vắng",
  active: "Hoạt động",
  inactive: "Ngừng hoạt động",
  maintenance: "Bảo trì",
  paid: "Đã thu tiền",
  delivered: "Đã bàn giao",
  open: "Mới",
  assigned: "Đã nhận/giao",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
  closed: "Đã đóng",
  rejected: "Từ chối",
  approved: "Đã duyệt",
  refunded: "Đã hoàn tiền",
  waiting_approval: "Chờ duyệt",
  blocked: "Có sự cố",
  queued: "Đang chờ",
  running: "Đang chạy",
  failed: "Thất bại",
  processed: "Đã đối soát",
  review: "Cần kiểm tra",
  unmatched: "Chưa khớp",
  locked: "Đã khóa",
  suspended: "Tạm dừng",
  refund_pending: "Chờ hoàn tiền",
  bank_transfer: "Chuyển khoản",
  demo: "Mô phỏng",
  customer: "Khách hàng",
  coach: "Huấn luyện viên",
  owner: "Chủ sân",
  admin: "Quản trị viên",
  receptionist: "Lễ tân",
  technician: "Kỹ thuật",
  cleaner: "Vệ sinh",
  sale: "Bán hàng",
  rental: "Cho thuê",
  technical: "Kỹ thuật",
};
const status = (s) =>
  `<span class="status status-${escape(String(s).replace(/[^a-z_]/g, ""))}">${escape(labels[s] || s)}</span>`;
let user,
  options = {},
  poll = null,
  routeVersion = 0,
  actionMap = new Map(),
  nextAction = 0,
  formSubmit = null,
  receptionDate = null;
async function api(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (method !== "GET")
    headers["X-CSRF-Token"] = (
      await fetch("/api/csrf").then((r) => r.json())
    ).token;
  const r = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Không tải được dữ liệu.");
  return d;
}
function toast(msg) {
  $("#toast").textContent = msg;
  $("#toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").hidden = true), 5000);
}
function button(label, fn, kind = "") {
  const id = ++nextAction;
  actionMap.set(String(id), fn);
  return `<button type="button" class="${escape(kind)}" data-do="${id}">${escape(label)}</button>`;
}
function toolbar(label, fn, kind = "primary") {
  actions.insertAdjacentHTML("beforeend", button(label, fn, kind));
}
function table(headers, rows) {
  return rows.length
    ? `<div class="table-wrap" tabindex="0" aria-label="Bảng dữ liệu, cuộn ngang để xem thêm"><table><thead><tr>${headers.map((h) => `<th scope="col">${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td data-label="${escape(headers[i])}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">${icon("calendar")}<strong>Chưa có dữ liệu</strong><p>Các thông tin mới sẽ xuất hiện tại đây khi có hoạt động.</p></div>`;
}
function page(title, subtitle = "") {
  clearInterval(poll);
  poll = null;
  document.title = title + " | N01SPORT";
  $("#title").textContent = title;
  $("#nav-toggle").innerHTML = escape(title) + icon("grid");
  $("#subtitle").textContent = subtitle;
  actions.innerHTML = "";
  view.innerHTML = '<div class="loading" role="status">Đang tải dữ liệu…</div>';
  view.setAttribute("aria-busy", "true");
}
function field(name, label, type = "text", extra = {}) {
  return { name, label, type, ...extra };
}
const venueField = () =>
  field("venue_id", "Cơ sở", "select", {
    options: (options.venues || []).map((v) => [v.id, v.name]),
  });
const courtField = () =>
  field("court_id", "Sân", "select", {
    options: (options.courts || []).map((v) => [v.id, v.name]),
  });
const activeField = () => field("active", "Đang hoạt động", "checkbox");
function edit(title, fields, values, submit) {
  $("#editor-title").textContent = title;
  $("#form-error").hidden = true;
  formSubmit = submit;
  $("#fields").innerHTML = fields
    .map((f) => {
      const id = "field-" + f.name,
        val = values?.[f.name] ?? f.default ?? "",
        required = f.optional || f.type === "checkbox" ? "" : "required";
      let control;
      if (f.type === "select")
        control = `<select id="${id}" name="${f.name}" ${required}>${f.options.map(([v, l]) => `<option value="${escape(v)}" ${String(v) === String(val) ? "selected" : ""}>${escape(l)}</option>`).join("")}</select>`;
      else if (f.type === "textarea")
        control = `<textarea id="${id}" name="${f.name}" ${required} maxlength="10000">${escape(val)}</textarea>`;
      else if (f.type === "checkbox")
        control = `<input id="${id}" name="${f.name}" type="checkbox" ${val ? "checked" : ""}>`;
      else
        control = `<input id="${id}" name="${f.name}" type="${f.type}" value="${escape(f.type === "datetime-local" ? String(val).replace(" ", "T").slice(0, 16) : val)}" ${required} ${f.type === "number" ? 'min="' + (f.step === "any" ? "-180" : "0") + '" step="' + (f.step || "1") + '"' : ""} ${f.type === "password" ? 'minlength="' + (f.name === "current_password" || title === "Đăng nhập" ? 1 : 10) + '" maxlength="128" autocomplete="' + (title === "Đăng nhập" ? "current-password" : "new-password") + '"' : ""}>`;
      return `<label for="${id}" class="${f.type === "textarea" ? "wide" : ""}">${escape(f.label)}${control}${f.hint ? `<small>${escape(f.hint)}</small>` : ""}</label>`;
    })
    .join("");
  $("#editor").showModal();
}
$("#editor-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const b = {};
  for (const el of $("#editor-form").elements) {
    if (!el.name) continue;
    b[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  const submit = e.submitter;
  submit.disabled = true;
  try {
    await formSubmit(b);
    $("#editor").close();
    const fresh = await api("/api/auth/me");
    user = fresh.user;
    if (user) {
      options = await api("/api/portal/options");
      $("#identity").textContent = user.full_name + " · " + labels[user.role];
    }
    toast("Đã lưu thông tin.");
    await route();
  } catch (err) {
    $("#form-error").textContent = err.message;
    $("#form-error").hidden = false;
    $("#form-error").focus();
  } finally {
    submit.disabled = false;
  }
});
$("#close-editor").onclick = $("#cancel-editor").onclick = () =>
  $("#editor").close();
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-do]");
  if (!b) return;
  const fn = actionMap.get(b.dataset.do);
  if (!fn) return;
  b.disabled = true;
  try {
    await fn();
  } catch (err) {
    toast(err.message);
  } finally {
    b.disabled = false;
  }
});
async function mutate(path, body, method = "POST") {
  await api(path, method, body);
  toast("Đã cập nhật.");
  await route();
}
const resourceConfigs = {
  venues: {
    title: "Cơ sở & giờ hoạt động",
    fields: () => [
      field("name", "Tên cơ sở"),
      field("slug", "Mã cơ sở (không dấu)"),
      field("description", "Giới thiệu", "textarea"),
      field("address", "Địa chỉ"),
      field("district", "Quận/huyện"),
      field("city", "Thành phố"),
      field("latitude", "Vĩ độ", "number", { step: "any" }),
      field("longitude", "Kinh độ", "number", { step: "any" }),
      field("open_time", "Mở cửa", "time"),
      field("close_time", "Đóng cửa", "time"),
    ],
    columns: ["name", "address", "open_time", "close_time", "status"],
    create: true,
  },
  courts: {
    title: "Sân thể thao",
    fields: () => [
      field("name", "Tên sân"),
      field("surface", "Mặt sân"),
      field("capacity", "Sức chứa", "number"),
      field("base_price", "Giá mỗi slot (đ)", "number"),
      field("slot_minutes", "Thời lượng slot", "select", {
        options: [30, 60, 90, 120].map((v) => [v, v + " phút"]),
      }),
      field("status", "Trạng thái", "select", {
        options: ["active", "maintenance", "inactive"].map((v) => [
          v,
          labels[v],
        ]),
      }),
    ],
    columns: ["name", "surface", "base_price", "slot_minutes", "status"],
    create: true,
  },
  images: {
    title: "Ảnh cơ sở",
    fields: () => [
      venueField(),
      field("image_url", "URL ảnh HTTPS hoặc ảnh đã tải lên"),
      field("alt_text", "Mô tả ảnh"),
      field("sort_order", "Thứ tự", "number", { default: 0 }),
    ],
    columns: ["venue_id", "image_url", "alt_text"],
    create: true,
  },
  prices: {
    title: "Bảng giá theo giờ",
    fields: () => [
      courtField(),
      field("name", "Tên bảng giá"),
      field("day_of_week", "Ngày áp dụng", "select", {
        options: [
          ["", "Mọi ngày"],
          [0, "Chủ nhật"],
          [1, "Thứ hai"],
          [2, "Thứ ba"],
          [3, "Thứ tư"],
          [4, "Thứ năm"],
          [5, "Thứ sáu"],
          [6, "Thứ bảy"],
        ],
        optional: true,
      }),
      field("start_time", "Từ giờ", "time"),
      field("end_time", "Đến giờ", "time"),
      field("price", "Giá mỗi slot (đ)", "number"),
      field("effective_from", "Từ ngày", "date", { optional: true }),
      field("effective_to", "Đến ngày", "date", { optional: true }),
      activeField(),
    ],
    columns: [
      "court_id",
      "name",
      "day_of_week",
      "start_time",
      "end_time",
      "price",
      "active",
    ],
    create: true,
  },
  promotions: {
    title: "Khuyến mãi",
    fields: () => [
      field("name", "Tên"),
      field("code", "Mã ưu đãi"),
      field("discount_type", "Loại", "select", {
        options: [
          ["percent", "Phần trăm"],
          ["fixed", "Số tiền"],
        ],
      }),
      field("discount_value", "Giá trị", "number"),
      field("min_order_value", "Đơn tối thiểu", "number", { default: 0 }),
      field("max_discount", "Giảm tối đa", "number", { optional: true }),
      field("usage_limit", "Tổng lượt tối đa", "number", { optional: true }),
      field("per_user_limit", "Lượt mỗi khách", "number", { default: 1 }),
      field("starts_at", "Bắt đầu", "datetime-local"),
      field("ends_at", "Kết thúc", "datetime-local"),
      activeField(),
    ],
    columns: ["code", "name", "discount_value", "ends_at", "active"],
    create: true,
  },
  services: {
    title: "Danh mục dịch vụ & tồn kho",
    fields: () => [
      venueField(),
      field("name", "Tên"),
      field("type", "Loại", "select", {
        options: ["sale", "rental", "technical"].map((v) => [v, labels[v]]),
      }),
      field("unit", "Đơn vị"),
      field("price", "Đơn giá", "number"),
      field("stock_quantity", "Số lượng có thể bán/cho thuê", "number"),
      activeField(),
    ],
    columns: ["venue_id", "name", "type", "price", "stock_quantity", "active"],
    create: true,
  },
  blocks: {
    title: "Lịch chặn bảo trì",
    fields: () => [
      courtField(),
      field("start_at", "Bắt đầu", "datetime-local"),
      field("end_at", "Kết thúc", "datetime-local"),
      field("reason", "Lý do"),
      activeField(),
    ],
    columns: ["court_id", "start_at", "end_at", "reason", "active"],
    create: true,
  },
  rewards: {
    title: "Ưu đãi đổi điểm",
    fields: () => [
      field("name", "Tên ưu đãi"),
      field("points_cost", "Điểm cần đổi", "number"),
      field("discount_value", "Giá trị mã giảm (đ)", "number"),
      activeField(),
    ],
    columns: ["name", "points_cost", "discount_value", "active"],
    create: true,
  },
  bank: {
    title: "Tài khoản nhận thanh toán",
    fields: () => [
      venueField(),
      field("bank_code", "Mã ngân hàng (VD: VCB, MB, ACB)"),
      field("account_number", "Số tài khoản"),
      field("account_name", "Tên chủ tài khoản"),
    ],
    columns: ["venue_id", "bank_code", "account_number", "account_name"],
    create: true,
  },
  users: {
    title: "Tài khoản & phân quyền",
    fields: () => [
      field("full_name", "Họ tên"),
      field("phone", "Số điện thoại", "tel", { optional: true }),
      field("role", "Vai trò", "select", {
        options: [
          "customer",
          "coach",
          "owner",
          "admin",
          "receptionist",
          "technician",
          "cleaner",
        ].map((v) => [v, labels[v]]),
      }),
      field("status", "Trạng thái", "select", {
        options: ["active", "locked", "pending"].map((v) => [
          v,
          labels[v] || "Chờ duyệt",
        ]),
      }),
    ],
    columns: ["full_name", "email", "role", "status"],
    create: true,
  },
  settings: {
    title: "Cấu hình website",
    fields: () => [
      field("setting_key", "Mục cấu hình", "select", {
        options: [
          ["site_name", "Tên website"],
          ["support_email", "Email hỗ trợ"],
          ["support_phone", "Điện thoại"],
          ["company_address", "Địa chỉ vận hành"],
          ["terms", "Điều khoản"],
          ["privacy", "Quyền riêng tư"],
        ],
      }),
      field("setting_value", "Nội dung", "textarea"),
      field("description", "Ghi chú", "text", { optional: true }),
    ],
    columns: ["setting_key", "setting_value", "updated_at"],
    create: true,
  },
};
const columnLabels = {
  name: "Tên",
  address: "Địa chỉ",
  status: "Trạng thái",
  open_time: "Mở cửa",
  close_time: "Đóng cửa",
  surface: "Mặt sân",
  base_price: "Giá slot",
  slot_minutes: "Phút",
  venue_id: "Cơ sở",
  court_id: "Sân",
  image_url: "Ảnh",
  alt_text: "Mô tả",
  day_of_week: "Ngày tuần",
  start_time: "Từ giờ",
  end_time: "Đến giờ",
  price: "Giá",
  active: "Hoạt động",
  code: "Mã",
  discount_value: "Mức giảm",
  ends_at: "Hết hạn",
  type: "Loại",
  stock_quantity: "Tồn khả dụng",
  start_at: "Bắt đầu",
  end_at: "Kết thúc",
  reason: "Lý do",
  points_cost: "Điểm",
  bank_code: "Ngân hàng",
  account_number: "Số tài khoản",
  account_name: "Chủ tài khoản",
  full_name: "Họ tên",
  email: "Email",
  role: "Vai trò",
  setting_key: "Mục",
  setting_value: "Nội dung",
  updated_at: "Cập nhật",
};
function cell(k, v) {
  if (k === "active") return v ? "Có" : "Không";
  if (k === "venue_id")
    return escape(options.venues?.find((x) => x.id === v)?.name || v);
  if (k === "court_id")
    return escape(options.courts?.find((x) => x.id === v)?.name || v);
  if (["status", "role", "type"].includes(k)) return status(v);
  if (["price", "base_price"].includes(k)) return money(v);
  return escape(v);
}
async function resource(name) {
  const cfg = resourceConfigs[name];
  page(cfg.title, "Thay đổi được lưu theo quyền quản lý của tài khoản.");
  const { rows } = await api("/api/manage/" + name);
  const open = (row) => {
    let fields = cfg.fields(),
      endpoint =
        "/api/manage/" +
        name +
        (row
          ? "/" + encodeURIComponent(row.id ?? row.venue_id ?? row.setting_key)
          : ""),
      values = row || { active: true };
    if (!row && name === "courts") {
      fields = [
        venueField(),
        field("sport_id", "Bộ môn", "select", {
          options: options.sports.map((s) => [s.id, s.name]),
        }),
        ...fields.filter((f) => f.name !== "status"),
      ];
      endpoint = "/api/owner/courts";
    }
    if (!row && name === "promotions") endpoint = "/api/owner/promotions";
    if (!row && name === "users") {
      fields = [
        field("email", "Email", "email"),
        field("password", "Mật khẩu", "password"),
        ...fields,
      ];
      endpoint = "/api/admin/users";
    }
    edit(row ? "Chỉnh sửa" : "Thêm mới", fields, values, (b) =>
      api(endpoint, row ? "PATCH" : "POST", b),
    );
  };
  if (cfg.create) toolbar("Thêm mới", () => open(null));
  if (name === "images")
    toolbar(
      "Tải ảnh lên",
      () =>
        edit(
          "Tải ảnh PNG/JPEG (tối đa 600 KB)",
          [field("file", "Ảnh", "file")],
          {},
          async () => {
            const file = $("#field-file").files[0];
            if (!file || file.size > 600000)
              throw new Error("Chọn ảnh tối đa 600 KB.");
            const data = await new Promise((r, j) => {
              const fr = new FileReader();
              fr.onload = () => r(fr.result);
              fr.onerror = j;
              fr.readAsDataURL(file);
            });
            const uploaded = await api("/api/uploads", "POST", { data });
            setTimeout(
              () =>
                edit(
                  "Gắn ảnh vào cơ sở",
                  cfg.fields(),
                  { image_url: uploaded.url, sort_order: 0 },
                  (b) => api("/api/manage/images", "POST", b),
                ),
              20,
            );
          },
        ),
      "",
    );
  view.innerHTML = table(
    [...cfg.columns.map((k) => columnLabels[k]), "Thao tác"],
    rows.map((row) => [
      ...cfg.columns.map((k) => cell(k, row[k])),
      button("Chỉnh sửa", () => open(row)),
    ]),
  );
}
async function profile() {
  page("Hồ sơ của tôi", "Quản lý thông tin và bảo vệ tài khoản.");
  view.innerHTML = `<section class="panel"><h2>${escape(user.full_name)}</h2><p>${escape(user.email)}</p><p>${escape(user.phone || "Chưa có số điện thoại")} · ${status(user.role)}</p>${button("Sửa hồ sơ", () => edit("Cập nhật hồ sơ", [field("full_name", "Họ tên"), field("phone", "Điện thoại", "tel", { optional: true })], user, (b) => api("/api/profile", "PATCH", b)))}</section><section class="panel"><h2>Mật khẩu</h2><p>Đổi mật khẩu sẽ đăng xuất tất cả thiết bị.</p>${button(
    "Đổi mật khẩu",
    () =>
      edit(
        "Đổi mật khẩu",
        [
          field("current_password", "Mật khẩu hiện tại", "password"),
          field("password", "Mật khẩu mới (ít nhất 10 ký tự)", "password"),
        ],
        {},
        async (b) => {
          await api("/api/account/password", "POST", b);
          location.href = "/account.html";
        },
      ),
  )}</section>`;
}
async function bookings() {
  page("Lịch đặt sân", "Theo dõi thanh toán, dịch vụ, hủy và phiếu thu.");
  const { bookings } = await api("/api/bookings");
  view.innerHTML = table(
    ["Mã đặt", "Sân", "Thời gian", "Tiền sân", "Trạng thái", "Thao tác"],
    bookings.map((b) => [
      escape(b.booking_code),
      escape(b.court_name),
      time(b.start_at),
      money(b.total_amount),
      status(b.status),
      `<div class="row-actions">${b.status === "pending" ? button("Thanh toán", () => (location.hash = "payment=" + b.id), "primary") : ""}${["pending", "confirmed"].includes(b.status) ? button("Yêu cầu hủy", () => edit("Hủy booking", [field("reason", "Lý do", "textarea")], {}, (v) => api("/api/bookings/" + b.id + "/cancel", "POST", v)), "danger") : ""}${["confirmed", "checked_in"].includes(b.status) ? button("Thêm dịch vụ", () => newOrder(b.id)) : ""}${button("Phiếu thu", () => (location.hash = "invoice=" + b.id))}${b.status === "completed" ? button("Đánh giá", () => edit("Đánh giá", [field("rating", "Điểm", "select", { options: [1, 2, 3, 4, 5].map((i) => [i, i + " / 5"]), default: 5 }), field("comment", "Nhận xét", "textarea", { optional: true })], {}, (v) => api("/api/bookings/" + b.id + "/review", "POST", v))) : ""}</div>`,
    ]),
  );
}
async function payment(id) {
  page(
    "Thanh toán booking",
    "Chuyển đúng số tiền và nội dung. Không chuyển tiền khi đơn hết hạn.",
  );
  const render = async () => {
    const d = await api("/api/bookings/" + id + "/payment"),
      b = d.booking;
    const pending =
      b.status === "pending" &&
      new Date(
        String(b.hold_expires_at).replace(" ", "T") + "+07:00",
      ).getTime() > Date.now();
    view.innerHTML = `<section class="panel payment-grid"><div>${!d.demo && pending ? `<img class="qr" src="${escape(d.bank.qr_url)}" alt="Mã QR chuyển khoản booking ${escape(b.booking_code)}">` : ""}</div><div><h2>${escape(b.booking_code)}</h2><p>${escape(b.court_name)} · ${time(b.start_at)}</p><p class="total">${money(b.total_amount)}</p><p>${status(b.status)} ${status(b.payment_status)}</p>${pending ? (d.demo ? `<p>Chế độ thử nghiệm, không thu tiền thật.</p>${button("Xác nhận mô phỏng", () => mutate("/api/bookings/" + id + "/pay", {}), "primary")}` : `<p>Ngân hàng: <strong>${escape(d.bank.bank_code)}</strong><br>Số tài khoản: <strong>${escape(d.bank.account_number)}</strong><br>Chủ tài khoản: ${escape(d.bank.account_name)}<br>Nội dung: <strong>${escape(d.bank.memo)}</strong></p><p>Hạn giữ chỗ: ${time(b.hold_expires_at)}. Trạng thái tự cập nhật sau khi nhận xác nhận ngân hàng.</p>`) : "<p>Đơn đã xử lý hoặc hết hạn. Kiểm tra lịch của bạn trước khi chuyển tiền.</p>"}</div></section>`;
    if (!pending) clearInterval(poll);
  };
  await render();
  poll = setInterval(
    () =>
      render().catch((e) => {
        clearInterval(poll);
        toast(e.message);
      }),
    6000,
  );
}
async function invoice(id) {
  page(
    "Phiếu thu & chi tiết giao dịch",
    "Phiếu xác nhận nội bộ; không phải hóa đơn điện tử thuế.",
  );
  const {
    booking: b,
    orders,
    items,
  } = await api("/api/bookings/" + id + "/invoice");
  toolbar("In / Lưu PDF", () => window.print());
  view.innerHTML = `<article class="panel receipt"><p class="eyebrow">N01SPORT / PHIẾU XÁC NHẬN</p><h2>${escape(b.booking_code)}</h2><dl><dt>Khách hàng</dt><dd>${escape(b.full_name)}</dd><dt>Cơ sở</dt><dd>${escape(b.venue_name)}</dd><dt>Sân / giờ</dt><dd>${escape(b.court_name)} · ${time(b.start_at)}</dd><dt>Giá sân</dt><dd>${money(b.subtotal)}</dd><dt>Giảm giá</dt><dd>${money(b.discount_amount)}</dd><dt>Tổng tiền sân</dt><dd>${money(b.total_amount)}</dd><dt>Thanh toán</dt><dd>${escape(labels[b.payment_status] || b.payment_status)} · ${escape(b.transaction_ref || "Chưa có chứng từ")}</dd></dl><h3>Dịch vụ</h3>${table(
    ["Mặt hàng", "Số lượng", "Đơn giá", "Trạng thái"],
    items.map((i) => [
      escape(i.name),
      i.quantity,
      money(i.unit_price),
      status(i.status),
    ]),
  )}<p>Tiền dịch vụ đã thu: ${money(orders.filter((o) => ["paid", "delivered", "completed"].includes(o.status)).reduce((n, o) => n + o.amount + o.damage_fee, 0))}</p><p>Địa chỉ: ${escape(b.address)}</p></article>`;
}
async function notifications() {
  page("Thông báo");
  const d = await api("/api/notifications");
  toolbar("Đánh dấu đã đọc", () => mutate("/api/notifications/read", {}));
  view.innerHTML = d.notifications.length
    ? d.notifications
        .map(
          (n) =>
            `<article class="panel ${n.read_at ? "" : "unread"}"><h3>${escape(n.title)}</h3><p>${escape(n.message)}</p><small class="muted">${time(n.created_at)}</small></article>`,
        )
        .join("")
    : '<div class="empty">Chưa có thông báo.</div>';
}
async function loyalty() {
  page(
    "Điểm & ưu đãi",
    "Mã đổi điểm dùng trong 30 ngày, tại cơ sở của chủ sân phát hành.",
  );
  const d = await api("/api/account/loyalty");
  view.innerHTML = `<div class="metric"><strong>${d.points}</strong><span>Điểm tích lũy</span></div><h2>Đổi ưu đãi</h2>${table(
    ["Ưu đãi", "Chủ sân", "Điểm", "Giá trị", "Thao tác"],
    d.rewards.map((r) => [
      escape(r.name),
      escape(r.owner_name),
      r.points_cost,
      money(r.discount_value),
      button("Đổi điểm", async () => {
        if (confirm("Đổi " + r.points_cost + " điểm lấy ưu đãi?")) {
          const x = await api("/api/rewards/" + r.id + "/redeem", "POST", {});
          toast("Mã của bạn: " + x.code);
          await route();
        }
      }),
    ]),
  )}<h2>Mã đã đổi</h2>${table(
    ["Mã", "Ưu đãi", "Hết hạn"],
    d.coupons.map((c) => [escape(c.code), escape(c.name), time(c.ends_at)]),
  )}<h2>Lịch sử điểm</h2>${table(
    ["Thời gian", "Điểm", "Nội dung"],
    d.history.map((h) => [time(h.created_at), h.points, escape(h.reason)]),
  )}`;
}
async function support() {
  page(
    "Hỗ trợ & phản hồi",
    "Yêu cầu gửi đến chủ sân của cơ sở hoặc quản trị viên.",
  );
  const d = await api("/api/support");
  toolbar("Gửi yêu cầu", () =>
    edit(
      "Yêu cầu hỗ trợ",
      [
        field("venue_id", "Cơ sở", "select", {
          options: [
            ["", "Hỗ trợ toàn hệ thống"],
            ...options.publicVenues.map((v) => [v.id, v.name]),
          ],
          optional: true,
        }),
        field("subject", "Tiêu đề"),
        field("message", "Nội dung", "textarea"),
      ],
      {},
      (b) => api("/api/support", "POST", b),
    ),
  );
  view.innerHTML = table(
    ["Tiêu đề", "Người gửi", "Cơ sở", "Trạng thái", "Thao tác"],
    d.tickets.map((t) => [
      escape(t.subject),
      escape(t.full_name),
      escape(t.venue_name || "Hệ thống"),
      status(t.status),
      button("Xem trao đổi", () => (location.hash = "ticket=" + t.id)),
    ]),
  );
}
async function ticket(id) {
  page("Trao đổi hỗ trợ");
  const { ticket: t, replies } = await api("/api/support/" + id);
  view.innerHTML = `<section class="panel"><h2>${escape(t.subject)}</h2><p>${escape(t.message)}</p>${status(t.status)}${replies.map((r) => `<article class="conversation"><strong>${escape(r.full_name)}</strong><small> · ${time(r.created_at)}</small><p>${escape(r.message)}</p></article>`).join("")}</section>`;
  toolbar("Phản hồi", () =>
    edit(
      "Gửi phản hồi",
      [
        field("message", "Nội dung", "textarea"),
        field("status", "Trạng thái", "select", {
          options: ["open", "in_progress", "resolved", "closed"].map((s) => [
            s,
            labels[s],
          ]),
        }),
      ],
      { status: t.status },
      (b) => api("/api/support/" + id, "POST", b),
    ),
  );
}
async function newOrder(bookingId) {
  const d = await api("/api/services?booking_id=" + bookingId);
  if (!d.services.length) return toast("Cơ sở chưa có dịch vụ.");
  edit(
    "Thêm dịch vụ",
    [
      field("service_id", "Dịch vụ", "select", {
        options: d.services.map((s) => [
          s.id,
          `${s.name} · ${money(s.price)} · còn ${s.stock_quantity}`,
        ]),
      }),
      field("quantity", "Số lượng", "number", { default: 1 }),
    ],
    {},
    (b) =>
      api("/api/orders", "POST", {
        booking_id: bookingId,
        items: [{ service_id: b.service_id, quantity: b.quantity }],
      }),
  );
}
async function orders() {
  page(
    "Đơn dịch vụ & thuê dụng cụ",
    "Dịch vụ thu tiền tại quầy; tồn kho được giữ khi tạo đơn, tự nhả sau 30 phút nếu chưa thu tiền.",
  );
  const { orders, items } = await api("/api/orders");
  const manager = ["owner", "receptionist", "admin"].includes(user.role);
  toolbar("Tạo đơn dịch vụ", () =>
    edit(
      "Chọn booking",
      [field("booking_id", "Mã ID booking", "number")],
      {},
      async (b) => {
        setTimeout(
          () => newOrder(b.booking_id).catch((e) => toast(e.message)),
          20,
        );
      },
    ),
  );
  view.innerHTML = table(
    [
      "Đơn / booking",
      "Mặt hàng",
      "Khách",
      "Tiền / phí",
      "Trạng thái",
      "Thao tác",
    ],
    orders.map((o) => {
      const its = items.filter((i) => i.order_id === o.id),
        doEdit = (title, fs, action) =>
          edit(title, fs, {}, (b) =>
            api("/api/orders/" + o.id, "PATCH", { ...b, action }),
          );
      return [
        escape(o.order_code) + "<small>" + escape(o.booking_code) + "</small>",
        its.map((i) => escape(i.name) + " × " + i.quantity).join("<br>"),
        escape(o.full_name),
        money(o.amount) + "<small>Phí: " + money(o.damage_fee) + "</small>",
        status(o.status),
        `<div class="row-actions">${o.status === "pending" ? button("Hủy", () => confirm("Hủy đơn dịch vụ?") && mutate("/api/orders/" + o.id, { action: "cancel" }, "PATCH"), "danger") : ""}${manager && o.status === "pending" ? button("Ghi nhận thu tiền", () => doEdit("Chứng từ thu tiền", [field("payment_ref", "Số phiếu thu / mã chuyển khoản")], "pay")) : ""}${manager && o.status === "paid" ? button("Bàn giao", () => doEdit("Bàn giao", [field("condition_out", "Tình trạng lúc giao")], "deliver")) : ""}${
          manager && o.status === "delivered"
            ? button("Nhận lại", () =>
                edit(
                  "Nhận lại dụng cụ",
                  [
                    ...its
                      .filter((i) => i.type === "rental")
                      .map((i) =>
                        field(
                          "lost_" + i.id,
                          "Số mất/hỏng: " + i.name,
                          "number",
                          { default: 0 },
                        ),
                      ),
                    field("condition_in", "Tình trạng nhận lại"),
                    field("damage_fee", "Phí mất/hỏng đã thu", "number", {
                      default: 0,
                    }),
                    field("payment_ref", "Chứng từ phí (nếu có)", "text", {
                      optional: true,
                    }),
                  ],
                  {},
                  (b) => {
                    const lost = {};
                    for (const [k, v] of Object.entries(b))
                      if (k.startsWith("lost_")) lost[k.slice(5)] = v;
                    return api("/api/orders/" + o.id, "PATCH", {
                      ...b,
                      lost,
                      action: "return",
                    });
                  },
                ),
              )
            : ""
        }</div>`,
      ];
    }),
  );
}
async function staff() {
  page("Nhân viên & phân công");
  const data = await api("/api/owner/dashboard"),
    assign = await api("/api/manage/assignments");
  const position = field("position", "Vị trí", "select", {
    options: ["receptionist", "technician", "cleaner"].map((s) => [
      s,
      labels[s],
    ]),
  });
  const fields = [
    field("full_name", "Họ tên"),
    field("phone", "Điện thoại", "tel", { optional: true }),
    position,
    field("shift_start", "Bắt đầu ca", "datetime-local"),
    field("shift_end", "Kết thúc ca", "datetime-local"),
  ];
  toolbar("Thêm nhân viên", () =>
    edit(
      "Tạo nhân viên",
      [
        venueField(),
        field("email", "Email", "email"),
        field("password", "Mật khẩu", "password"),
        ...fields,
      ],
      {},
      (b) => api("/api/owner/staff", "POST", b),
    ),
  );
  view.innerHTML = table(
    ["Nhân viên", "Email", "Vị trí", "Cơ sở", "Phân công", "Thao tác"],
    assign.rows.map((a) => {
      const u = data.staff.find((s) => s.id === a.staff_id) || {
        id: a.staff_id,
        full_name: "Nhân viên #" + a.staff_id,
      };
      return [
        escape(u.full_name),
        escape(u.email),
        status(a.position),
        cell("venue_id", a.venue_id),
        a.active ? "Đang phân công" : "Đã ngừng",
        button("Sửa / ngừng", () =>
          edit(
            "Cập nhật nhân viên",
            [...fields, activeField()],
            { ...u, ...a },
            (b) =>
              api("/api/owner/staff/" + a.staff_id, "PATCH", {
                ...b,
                assignment_id: a.id,
              }),
          ),
        ),
      ];
    }),
  );
}
async function work() {
  page("Công việc của tôi");
  const d = await api("/api/staff/dashboard");
  const tech = user.role === "technician";
  if (user.role === "receptionist") return reception();
  if (tech)
    toolbar("Báo sự cố", () =>
      edit(
        "Báo sự cố kỹ thuật",
        [
          courtField(),
          field("title", "Tiêu đề"),
          field("description", "Mô tả", "textarea"),
          field("priority", "Ưu tiên", "select", {
            options: [
              ["low", "Thấp"],
              ["medium", "Bình thường"],
              ["high", "Cao"],
              ["urgent", "Khẩn cấp"],
            ],
          }),
        ],
        {},
        (b) => api("/api/staff/maintenance", "POST", b),
      ),
    );
  const path = tech ? "maintenance" : "cleaning",
    transitions = tech
      ? {
          open: ["assigned"],
          assigned: ["in_progress", "waiting_approval"],
          in_progress: ["resolved", "waiting_approval"],
        }
      : {
          pending: ["assigned"],
          assigned: ["in_progress"],
          in_progress: ["completed", "blocked"],
          blocked: ["in_progress"],
        };
  view.innerHTML = table(
    ["Sân", "Nội dung", "Trạng thái", "Thao tác"],
    d.work.map((t) => [
      escape(t.court_name),
      escape(t.title || t.issue_note || "Vệ sinh sau lượt chơi"),
      status(t.status),
      `<div class="row-actions">${(transitions[t.status] || []).map((s) => button(labels[s], () => (s === "waiting_approval" ? edit("Đề xuất bảo trì", [field("proposed_start", "Bắt đầu", "datetime-local"), field("proposed_end", "Kết thúc", "datetime-local")], {}, (b) => api("/api/staff/" + path + "/" + t.id, "PATCH", { ...b, status: s })) : s === "blocked" ? edit("Báo sự cố", [field("issue_note", "Nội dung", "textarea")], {}, (b) => api("/api/staff/" + path + "/" + t.id, "PATCH", { ...b, status: s })) : mutate("/api/staff/" + path + "/" + t.id, { status: s }, "PATCH")))).join("")}</div>`,
    ]),
  );
}
async function reception(date = receptionDate || today(), q = "") {
  receptionDate = date;
  page("Tra cứu & tiếp nhận booking");
  if (user.role === "receptionist")
    toolbar("Đặt sân tại quầy", () => walkInBooking(date));
  const d = await api(
    "/api/manage/bookings?" + new URLSearchParams({ date, q }),
  );
  view.innerHTML =
    `<form class="filter" id="booking-filter"><label>Ngày<input type="date" name="date" value="${escape(date)}" required></label><label>Mã đặt / khách<input name="q" value="${escape(q)}"></label><button class="primary">Tra cứu</button></form>` +
    table(
      [
        "ID / mã",
        "Khách",
        "Sân",
        "Giờ",
        "Thanh toán",
        "Trạng thái",
        "Thao tác",
      ],
      d.bookings.map((b) => [
        b.id + "<small>" + escape(b.booking_code) + "</small>",
        escape(b.full_name) + (b.guest_name ? "<small>Đặt tại quầy</small>" : ""),
        escape(b.court_name),
        time(b.start_at),
        status(b.payment_status),
        status(b.status),
        `<div class="row-actions">${
          user.role === "receptionist"
            ? (b.status === "confirmed"
                ? [
                    ["checked_in", "Check-in"],
                    ["no_show", "Khách vắng"],
                  ]
                : b.status === "checked_in"
                  ? [["completed", "Hoàn tất"]]
                  : []
              )
                .map(([s, l]) =>
                  button(l, () =>
                    mutate(
                      "/api/staff/bookings/" + b.id + "/status",
                      { status: s },
                      "PATCH",
                    ),
                  ),
                )
                .join("")
            : ""
        }${user.role === "receptionist" && b.guest_name && b.payment_status === "pending" && ["confirmed", "checked_in", "completed"].includes(b.status) ? button("Đã nhận tiền mặt", () => mutate(`/api/staff/bookings/${b.id}/pay`, { payment_method: "cash" })) + button("Đã nhận chuyển khoản", () => mutate(`/api/staff/bookings/${b.id}/pay`, { payment_method: "bank_transfer" })) : ""}${["confirmed", "checked_in"].includes(b.status) ? button("Dịch vụ", () => newOrder(b.id)) : ""}${button("Phiếu thu", () => (location.hash = "invoice=" + b.id))}</div>`,
      ]),
    );
  $("#booking-filter").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    reception(fd.get("date"), fd.get("q")).catch((e) => toast(e.message));
  };
}
async function walkInBooking(date) {
  const { courts } = await api("/api/staff/courts");
  if (!courts.length) return toast("Chưa có sân hoạt động tại cơ sở được phân công.");
  let slots = [], request = 0;
  edit("Đặt sân cho khách tại quầy", [
    field("court_id", "Sân", "select", { options: courts.map((c) => [c.id, `${c.venue_name} · ${c.name}`]) }),
    field("date", "Ngày chơi", "date", { default: date < today() ? today() : date }),
    field("slot", "Khung giờ còn trống", "select", { options: [["", "Đang tải khung giờ…"]] }),
    field("guest_name", "Tên khách"),
    field("guest_phone", "Số điện thoại", "tel"),
    field("payment_method", "Thu tiền", "select", { default: "unpaid", options: [["unpaid", "Chưa thu tiền"], ["cash", "Đã nhận tiền mặt"], ["bank_transfer", "Đã nhận chuyển khoản"]], hint: "Chỉ chọn đã nhận tiền khi đã thu đủ tiền của khách." }),
    field("note", "Ghi chú", "textarea", { optional: true }),
  ], {}, async (body) => {
    const slot = slots.find((s) => s.start_at === body.slot);
    if (!slot || $("#field-slot").disabled) throw new Error("Vui lòng chọn khung giờ còn trống.");
    await api("/api/staff/bookings", "POST", {
      court_id: Number(body.court_id), start_at: slot.start_at, end_at: slot.end_at,
      guest_name: body.guest_name.trim(), guest_phone: body.guest_phone.trim(),
      payment_method: body.payment_method, note: body.note.trim(),
    });
    receptionDate = body.date;
  });
  $("#field-date").min = today();
  $("#field-guest_name").minLength = 2;
  $("#field-guest_name").maxLength = 150;
  const reload = async () => {
    const version = ++request, select = $("#field-slot");
    slots = []; select.disabled = true;
    select.innerHTML = '<option value="">Đang tải khung giờ…</option>';
    try {
      const data = await api(`/api/courts/${Number($("#field-court_id").value)}/slots?date=${encodeURIComponent($("#field-date").value)}`);
      if (version !== request) return;
      slots = data.slots.filter((s) => s.available);
      select.innerHTML = '<option value="">Chọn khung giờ</option>' + slots.map((s) => `<option value="${escape(s.start_at)}">${escape(s.label)} · ${money(s.price)}</option>`).join("");
      select.disabled = !slots.length;
      if (!slots.length) select.innerHTML = '<option value="">Không còn khung giờ trống</option>';
    } catch (error) {
      if (version === request) { select.innerHTML = '<option value="">Không tải được khung giờ</option>'; toast(error.message); }
    }
  };
  $("#field-court_id").onchange = reload;
  $("#field-date").onchange = reload;
  await reload();
}
async function maintenance() {
  page("Yêu cầu kỹ thuật & bảo trì");
  const d = await api("/api/owner/dashboard");
  view.innerHTML = table(
    ["Sân", "Yêu cầu", "Phụ trách", "Trạng thái", "Thao tác"],
    d.maintenance.map((r) => [
      escape(r.court_name),
      escape(r.title) + "<small>" + escape(r.description) + "</small>",
      escape(r.assigned_name),
      status(r.status),
      button("Xử lý", () =>
        edit(
          "Phân công / xử lý bảo trì",
          [
            field("status", "Trạng thái", "select", {
              options: [
                "assigned",
                "in_progress",
                "resolved",
                "closed",
                "rejected",
              ].map((s) => [s, labels[s]]),
            }),
            field("assigned_to", "Kỹ thuật viên", "select", {
              options: [
                ["", "Giữ người hiện tại"],
                ...d.staff
                  .filter((s) => s.role === "technician")
                  .map((s) => [s.id, s.full_name]),
              ],
              optional: true,
            }),
            field("block_start", "Chặn từ", "datetime-local", {
              optional: true,
            }),
            field("block_end", "Chặn đến", "datetime-local", {
              optional: true,
            }),
          ],
          {
            status: "assigned",
            assigned_to: r.assigned_to,
            block_start: r.proposed_start,
            block_end: r.proposed_end,
          },
          (b) => api("/api/owner/maintenance/" + r.id, "PATCH", b),
        ),
      ),
    ]),
  );
}
async function refunds() {
  page(
    "Hủy & hoàn tiền",
    "Xác nhận hoàn tiền chỉ sau khi thực hiện chuyển khoản; lưu chứng từ để đối chiếu.",
  );
  const d = await api("/api/owner/dashboard");
  view.innerHTML = table(
    ["Booking", "Khách", "Lý do", "Tiền yêu cầu", "Trạng thái", "Thao tác"],
    d.refunds.map((r) => [
      escape(r.booking_code),
      escape(r.full_name),
      escape(r.reason),
      money(r.requested_amount),
      status(r.status),
      r.status === "pending"
        ? button("Duyệt", () =>
            edit(
              "Duyệt hoàn tiền",
              [
                field("approved_amount", "Tiền hoàn", "number"),
                field("review_note", "Ghi chú", "textarea", { optional: true }),
              ],
              { approved_amount: r.requested_amount },
              (b) =>
                api("/api/owner/refunds/" + r.id, "PATCH", {
                  ...b,
                  status: "approved",
                }),
            ),
          ) +
          " " +
          button("Từ chối", () =>
            edit(
              "Từ chối",
              [field("review_note", "Lý do", "textarea")],
              {},
              (b) =>
                api("/api/owner/refunds/" + r.id, "PATCH", {
                  ...b,
                  status: "rejected",
                }),
            ),
          )
        : r.status === "approved"
          ? button("Đã chuyển hoàn", () =>
              edit(
                "Chứng từ hoàn tiền",
                [field("transaction_ref", "Mã giao dịch hoàn tiền")],
                {},
                (b) =>
                  api("/api/owner/refunds/" + r.id, "PATCH", {
                    ...b,
                    status: "refunded",
                  }),
              ),
            )
          : "—",
    ]),
  );
}
async function coach() {
  page(
    "Lịch dạy & đặt sân định kỳ",
    "Đặt định kỳ giữ chỗ từng buổi. Thanh toán riêng từng booking trong thời hạn giữ chỗ.",
  );
  const d = await api("/api/coach/schedules");
  toolbar("Đặt sân định kỳ", async () => {
    const publicCourts = (await api("/api/courts")).courts;
    edit(
      "Đặt lịch mỗi tuần",
      [
        field("court_id", "Sân", "select", {
          options: publicCourts.map((c) => [
            c.id,
            c.name + " · " + c.venue_name,
          ]),
        }),
        field("start_at", "Buổi đầu - bắt đầu", "datetime-local"),
        field("end_at", "Buổi đầu - kết thúc", "datetime-local"),
        field("weeks", "Số tuần (2–12)", "number", { default: 4 }),
        field("class_name", "Tên lớp"),
        field("participant_limit", "Số học viên", "number", { default: 4 }),
        field("note", "Ghi chú", "textarea", { optional: true }),
      ],
      {},
      (b) => api("/api/coach/series", "POST", b),
    );
  });
  toolbar(
    "Gắn lớp vào booking",
    () =>
      edit(
        "Đăng ký lịch dạy",
        [
          field("booking_id", "ID booking", "number"),
          field("class_name", "Tên lớp"),
          field("participant_limit", "Số học viên", "number", { default: 4 }),
          field("note", "Ghi chú", "textarea", { optional: true }),
        ],
        {},
        (b) => api("/api/coach/schedules", "POST", b),
      ),
    "",
  );
  view.innerHTML = table(
    [
      "Lớp",
      "Booking",
      "Sân",
      "Thời gian",
      "Học viên",
      "Trạng thái",
      "Thao tác",
    ],
    d.schedules.map((s) => [
      escape(s.class_name),
      escape(s.booking_code),
      escape(s.court_name),
      time(s.start_at),
      s.participant_limit,
      status(s.booking_status),
      button("Sửa lớp", () =>
        edit(
          "Điều chỉnh lớp",
          [
            field(
              "start_at",
              "Bắt đầu buổi (giá mới phải bằng giá cũ)",
              "datetime-local",
            ),
            field("end_at", "Kết thúc buổi", "datetime-local"),
            field("class_name", "Tên lớp"),
            field("participant_limit", "Học viên", "number"),
            field("note", "Ghi chú", "textarea", { optional: true }),
          ],
          s,
          (b) => api("/api/coach/schedules/" + s.id, "PATCH", b),
        ),
      ),
    ]),
  );
}
async function transactions() {
  page("Lịch sử giao dịch");
  const d = await api("/api/transactions");
  view.innerHTML = table(
    ["Booking", "Cơ sở", "Số tiền", "Phương thức", "Trạng thái", "Chứng từ"],
    d.transactions.map((t) => [
      escape(t.booking_code),
      escape(t.venue_name),
      money(t.amount),
      status(t.provider),
      status(t.status),
      escape(t.transaction_ref || "—"),
    ]),
  );
}
function csv(rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]),
    quote = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'")
        .replaceAll('"', '""') +
      '"';
  const blob = new Blob(
    [
      "\ufeff",
      keys.map(quote).join(",") + "\r\n",
      ...rows.map((r) => keys.map((k) => quote(r[k])).join(",") + "\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "n01-report.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function reports(from = today().slice(0, 8) + "01", to = today()) {
  page(
    "Báo cáo & thống kê",
    "Tiền thu theo ngày; hoàn tiền tách riêng; tỷ lệ sử dụng đã trừ lịch bảo trì đang chặn.",
  );
  const d = await api("/api/reports?" + new URLSearchParams({ from, to }));
  toolbar("Xuất doanh thu CSV", () =>
    csv([
      ...d.daily.map((x) => ({ ...x, category: "Sân" })),
      ...d.services.map((x) => ({ ...x, category: "Dịch vụ" })),
      ...(d.refunds || []).map((x) => ({
        ...x,
        amount: -x.amount,
        category: "Hoàn tiền",
      })),
    ]),
  );
  toolbar("Xuất khách hàng CSV", () => csv(d.customers), "");
  view.innerHTML = `<form id="report-filter" class="filter"><label>Từ ngày<input name="from" type="date" value="${escape(from)}" required></label><label>Đến ngày<input name="to" type="date" value="${escape(to)}" required></label><button class="primary">Xem báo cáo</button></form><div class="cards"><div class="metric"><strong>${money(d.daily.reduce((a, b) => a + b.amount, 0))}</strong><span>Doanh thu sân</span></div><div class="metric"><strong>${money(d.services.reduce((a, b) => a + b.amount, 0))}</strong><span>Doanh thu dịch vụ</span></div><div class="metric"><strong>${d.customers.filter((c) => String(c.created_at).slice(0, 10) >= from && String(c.created_at).slice(0, 10) <= to).length}</strong><span>Khách mới có booking trong kỳ</span></div><div class="metric"><strong>${money(d.net_collected || 0)}</strong><span>Thu ròng trong kỳ</span></div></div><h2>Tiền sân đã thu theo ngày</h2>${table(
    ["Ngày", "Doanh thu", "Giao dịch"],
    d.daily.map((r) => [escape(r.date), money(r.amount), r.transactions]),
  )}<h2>Doanh thu dịch vụ</h2>${table(
    ["Ngày", "Doanh thu", "Đơn hàng"],
    d.services.map((r) => [escape(r.date), money(r.amount), r.orders]),
  )}<h2>Tiền đã hoàn</h2>${table(
    ["Ngày", "Số tiền", "Giao dịch"],
    (d.refunds || []).map((r) => [
      escape(r.date),
      money(r.amount),
      r.transactions,
    ]),
  )}<h2>Hiệu suất & sân được đặt nhiều</h2>${table(
    ["Sân", "Lượt đặt", "Phút đã đặt", "Phút bảo trì", "Tỷ lệ sử dụng"],
    d.courts.map((r) => [
      escape(r.name),
      r.bookings,
      r.used_minutes,
      r.blocked_minutes || 0,
      r.utilization + "%",
    ]),
  )}<h2>Giờ cao điểm</h2>${table(
    ["Giờ bắt đầu", "Lượt đặt"],
    d.hours.map((r) => [r.hour + ":00", r.bookings]),
  )}<h2>Khách hàng</h2>${table(
    ["Khách", "Email", "Lượt đặt", "Chi tiêu", "Điểm"],
    d.customers.map((c) => [
      escape(c.full_name),
      escape(c.email),
      c.bookings,
      money(c.spent),
      c.loyalty_points,
    ]),
  )}`;
  $("#report-filter").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    reports(f.get("from"), f.get("to")).catch((e) => toast(e.message));
  };
}
async function adminVenues() {
  page("Duyệt cơ sở");
  const d = await api("/api/admin/dashboard");
  view.innerHTML = table(
    ["Cơ sở", "Chủ sân", "Khu vực", "Trạng thái", "Thao tác"],
    d.venues.map((v) => [
      escape(v.name),
      escape(v.owner_name),
      escape(v.district),
      status(v.status),
      button(
        v.status === "active" ? "Tạm dừng" : "Duyệt hoạt động",
        () =>
          confirm("Cập nhật trạng thái cơ sở?") &&
          mutate(
            "/api/admin/venues/" + v.id,
            { status: v.status === "active" ? "suspended" : "active" },
            "PATCH",
          ),
      ),
    ]),
  );
}
async function audit() {
  page("Nhật ký hệ thống");
  const d = await api("/api/admin/dashboard");
  view.innerHTML = table(
    ["Thời gian", "Người thao tác", "Hành động", "Đối tượng", "ID"],
    d.audit.map((a) => [
      time(a.created_at),
      escape(a.actor_name || "Hệ thống"),
      escape(a.action),
      escape(a.entity_type),
      a.entity_id || "—",
    ]),
  );
}
async function backups() {
  page(
    "Sao lưu dữ liệu",
    "Worker tạo file SQL. Phục hồi vào database mới bằng lệnh trong hướng dẫn để tránh ghi đè dữ liệu đang chạy.",
  );
  toolbar("Tạo bản sao lưu", () => mutate("/api/admin/backups", {}));
  const d = await api("/api/admin/backups");
  view.innerHTML = table(
    ["ID", "Thời gian", "Trạng thái", "SHA-256", "Tải"],
    d.backups.map((b) => [
      b.id,
      time(b.created_at),
      status(b.status) +
        (b.error_message
          ? "<small>" + escape(b.error_message) + "</small>"
          : ""),
      escape(b.checksum_sha256 || "—"),
      b.status === "completed"
        ? `<a href="/api/admin/backups/${b.id}/download">Tải SQL</a>`
        : "—",
    ]),
  );
  toolbar("Làm mới", () => route(), "");
}
async function events() {
  page(
    "Đối soát ngân hàng",
    "Giao dịch sai số tiền, hết hạn hoặc thiếu mã được giữ lại để kiểm tra.",
  );
  const d = await api("/api/admin/payment-events");
  view.innerHTML = table(
    ["Mã ngân hàng", "Booking ID", "Số tiền", "Trạng thái", "Ghi chú"],
    d.events.map((e) => [
      escape(e.event_id),
      e.booking_id || "—",
      money(e.amount),
      status(e.status),
      escape(e.note),
    ]),
  );
}
async function errors() {
  page(
    "Theo dõi lỗi hệ thống",
    "Mã lỗi đã được lược bỏ dữ liệu nhạy cảm; lưu tối đa 90 ngày.",
  );
  const d = await api("/api/admin/errors");
  view.innerHTML = table(
    ["Thời gian", "Mã lỗi", "Đường dẫn"],
    d.errors.map((e) => [
      time(e.created_at),
      escape(e.error_code),
      escape(e.path),
    ]),
  );
}
async function overview() {
  page(
    "Tổng quan",
    `Chào ${user.full_name}. Cùng bắt đầu một ngày thật chủ động.`,
  );
  toolbar("Làm mới", () => route(), "");
  let metrics = [],
    rows = [],
    links = [],
    detail = "",
    heading = "Hoạt động gần đây";
  const count = (value) => Number(value || 0).toLocaleString("vi-VN");
  if (["customer", "coach"].includes(user.role)) {
    const d = await api("/api/bookings"),
      all = d.bookings;
    const upcoming = all.filter(
      (b) =>
        ["confirmed", "checked_in"].includes(b.status) &&
        new Date(
          String(b.end_at).replace(" ", "T") +
            (String(b.end_at).includes("Z") ? "" : "+07:00"),
        ) > new Date(),
    );
    metrics = [
      [upcoming.length, "Lịch chơi sắp tới", "calendar"],
      [
        all.filter((b) => b.status === "pending").length,
        "Đơn chờ thanh toán",
        "wallet",
      ],
      [
        all.filter((b) => b.status === "completed").length,
        "Buổi chơi hoàn tất",
        "chart",
      ],
      [user.loyalty_points || 0, "Điểm tích lũy", "gift"],
    ];
    rows = all
      .slice(0, 5)
      .map((b) => [
        escape(b.court_name),
        time(b.start_at),
        status(b.status),
        `<a class="text-link" href="#${b.status === "pending" ? "payment=" + b.id : "bookings"}">${b.status === "pending" ? "Thanh toán" : "Xem lịch"}</a>`,
      ]);
    links = [
      [
        "/#courts",
        "Đặt sân mới",
        "Chọn sân cho buổi chơi tiếp theo",
        "calendar",
      ],
      ["#bookings", "Lịch của tôi", "Theo dõi lịch đặt và thanh toán", "grid"],
      ["#loyalty", "Điểm & ưu đãi", "Xem quyền lợi trong tài khoản", "gift"],
    ];
  } else if (user.role === "owner") {
    const d = await api("/api/owner/dashboard");
    metrics = [
      [d.courts.length, "Sân đang quản lý", "grid"],
      [d.metrics.confirmed || 0, "Đơn đã xác nhận", "calendar"],
      [
        d.refunds.filter((r) => r.status === "pending").length,
        "Yêu cầu hoàn chờ xử lý",
        "wallet",
      ],
      [d.staff.length, "Nhân sự được phân công", "user"],
    ];
    rows = d.recent
      .slice(0, 5)
      .map((b) => [
        escape(b.court_name),
        time(b.start_at),
        status(b.status),
        escape(b.full_name),
      ]);
    links = [
      [
        "#reception",
        "Tiếp nhận đặt sân",
        "Tra cứu, check-in và xử lý lịch",
        "calendar",
      ],
      ["#courts", "Quản lý sân", "Cập nhật trạng thái và thông tin", "grid"],
      [
        "#reports",
        "Báo cáo vận hành",
        "Theo dõi dữ liệu theo thời gian",
        "chart",
      ],
    ];
  } else if (user.role === "admin") {
    const d = await api("/api/admin/dashboard");
    metrics = [
      [d.metrics.users || 0, "Tài khoản toàn hệ thống", "user"],
      [d.metrics.venues || 0, "Cơ sở thể thao", "building"],
      [d.metrics.courts || 0, "Sân toàn hệ thống", "grid"],
      [d.metrics.bookings || 0, "Tổng lịch đặt", "calendar"],
    ];
    heading = "Cơ sở mới nhất";
    detail = table(
      ["Cơ sở", "Khu vực", "Trạng thái", "Chủ sân"],
      d.venues
        .slice(0, 5)
        .map((v) => [
          escape(v.name),
          escape(v.district),
          status(v.status),
          escape(v.owner_name),
        ]),
    );
    links = [
      [
        "#adminvenues",
        "Duyệt cơ sở",
        "Quản lý các địa điểm trên nền tảng",
        "building",
      ],
      ["#users", "Tài khoản", "Kiểm tra tài khoản và phân quyền", "user"],
      [
        "#events",
        "Đối soát ngân hàng",
        "Theo dõi giao dịch cần kiểm tra",
        "wallet",
      ],
    ];
  } else {
    const d = await api("/api/staff/dashboard");
    metrics = [
      [d.work.length, "Mục trong danh sách công việc", "tools"],
      [
        d.work.filter((w) =>
          ["pending", "open", "assigned", "confirmed"].includes(w.status),
        ).length,
        "Chờ tiếp nhận hoặc thực hiện",
        "calendar",
      ],
      [
        d.work.filter((w) => ["in_progress", "checked_in"].includes(w.status))
          .length,
        "Đang thực hiện",
        "chart",
      ],
      [d.assignments.length, "Phân công cơ sở", "building"],
    ];
    links = [
      [
        "#work",
        "Công việc của tôi",
        "Xem chi tiết và cập nhật tiến độ",
        "tools",
      ],
      ["#notifications", "Thông báo", "Theo dõi cập nhật công việc", "bell"],
      ["#support", "Yêu cầu hỗ trợ", "Trao đổi khi cần trợ giúp", "help"],
    ];
    heading = "Không gian công việc";
    detail =
      '<div class="panel"><h3>Sẵn sàng cho ca làm việc</h3><p class="muted">Mở Công việc của tôi để xem đầy đủ lịch và các thao tác phù hợp với vai trò của bạn.</p><a class="text-link" href="#work">Đi đến công việc →</a></div>';
  }
  const personal = ["customer", "coach"].includes(user.role);
  view.innerHTML = `<section class="overview-banner"><div><p>${personal ? "HẸN NHAU TRÊN SÂN" : "KHÔNG GIAN VẬN HÀNH"}</p><h2>${personal ? "Dành thời gian cho điều bạn thích." : "Mọi hoạt động. Cùng một nhịp."}</h2><span>${personal ? "Lịch đặt, ưu đãi và trải nghiệm của bạn — kết nối tại đây." : "Theo dõi thông tin, phối hợp công việc và chủ động mỗi ngày."}</span></div>${icon(personal ? "racket" : "building")}</section><div class="cards overview-metrics">${metrics.map(([v, label, i]) => `<div class="metric">${icon(i)}<strong>${count(v)}</strong><span>${label}</span></div>`).join("")}</div><section class="shortcut-grid" aria-label="Truy cập nhanh">${links.map(([href, title, desc, i]) => `<a class="shortcut" href="${href}">${icon(i)}<div><strong>${title}</strong><span>${desc}</span></div>${icon("arrow")}</a>`).join("")}</section><div class="overview-section-heading"><h2>${heading}</h2><span>Dữ liệu tại thời điểm tải trang</span></div>${detail || table(["Sân", "Thời gian", "Trạng thái", personal ? "Thao tác" : "Người đặt"], rows)}`;
}
const common = [
  ["profile", "Hồ sơ"],
  ["notifications", "Thông báo"],
  ["support", "Hỗ trợ"],
];
function navigation() {
  let tabs = [...common];
  if (["customer", "coach"].includes(user.role))
    tabs = [
      ["bookings", "Lịch của tôi"],
      ["orders", "Dịch vụ & dụng cụ"],
      ["loyalty", "Điểm & ưu đãi"],
      ["transactions", "Giao dịch"],
      ...(user.role === "coach" ? [["coach", "Lịch dạy"]] : []),
      ...common,
    ];
  if (user.role === "owner")
    tabs = [
      ["reception", "Booking"],
      ...[
        "venues",
        "courts",
        "images",
        "prices",
        "bank",
        "promotions",
        "services",
        "rewards",
      ].map((k) => [k, resourceConfigs[k].title]),
      ["orders", "Đơn dịch vụ"],
      ["staff", "Nhân viên"],
      ["maintenance", "Kỹ thuật"],
      ["blocks", "Lịch bảo trì"],
      ["refunds", "Hoàn tiền"],
      ["reports", "Báo cáo"],
      ["transactions", "Giao dịch"],
      ...common,
    ];
  if (user.role === "admin")
    tabs = [
      ["users", "Tài khoản"],
      ["adminvenues", "Duyệt cơ sở"],
      ["reports", "Báo cáo"],
      ["transactions", "Giao dịch"],
      ["events", "Đối soát ngân hàng"],
      ["settings", "Cấu hình"],
      ["backups", "Sao lưu"],
      ["audit", "Nhật ký"],
      ["errors", "Lỗi hệ thống"],
      ...common,
    ];
  if (["receptionist", "technician", "cleaner"].includes(user.role))
    tabs = [
      ["work", "Công việc"],
      ...(user.role === "receptionist"
        ? [["orders", "Dịch vụ & dụng cụ"]]
        : []),
      ...common,
    ];
  tabs.unshift(["overview", "Tổng quan"]);
  const groups = [
    [
      "KHÔNG GIAN LÀM VIỆC",
      [
        "overview",
        "bookings",
        "reception",
        "work",
        "coach",
        "orders",
        "loyalty",
      ],
    ],
    [
      "QUẢN LÝ CƠ SỞ",
      [
        "venues",
        "courts",
        "images",
        "prices",
        "services",
        "promotions",
        "rewards",
        "staff",
        "maintenance",
        "blocks",
      ],
    ],
    [
      "TÀI CHÍNH & DỮ LIỆU",
      ["reports", "transactions", "bank", "refunds", "events"],
    ],
    [
      "QUẢN TRỊ HỆ THỐNG",
      ["users", "adminvenues", "settings", "backups", "audit", "errors"],
    ],
    ["TÀI KHOẢN", ["profile", "notifications", "support"]],
  ];
  const icons = {
    overview: "grid",
    bookings: "calendar",
    reception: "calendar",
    work: "tools",
    coach: "calendar",
    orders: "bag",
    loyalty: "gift",
    venues: "building",
    courts: "grid",
    prices: "wallet",
    bank: "wallet",
    reports: "chart",
    transactions: "wallet",
    refunds: "wallet",
    events: "wallet",
    staff: "user",
    users: "user",
    profile: "user",
    notifications: "bell",
    support: "help",
    promotions: "gift",
    rewards: "gift",
    maintenance: "tools",
    blocks: "calendar",
  };
  $("#navigation").innerHTML = groups
    .map(([label, keys]) => {
      const items = keys
        .map((key) => tabs.find((t) => t[0] === key))
        .filter(Boolean);
      return items.length
        ? `<div class="nav-group"><p>${label}</p>${items.map(([k, l]) => `<a href="#${k}" data-tab="${k}">${icon(icons[k])}<span>${escape(l)}</span></a>`).join("")}</div>`
        : "";
    })
    .join("");
  return tabs;
}
async function authScreen(reset) {
  page(
    reset ? "Khôi phục mật khẩu" : "Đăng nhập tài khoản",
    "Đăng nhập để quản lý lịch và sử dụng dịch vụ.",
  );
  $("#navigation").innerHTML = "";
  view.innerHTML = `<div class="auth-layout"><div class="auth-image"><img src="/assets/tennis.webp" width="1536" height="1024" alt="Hình minh họa bạn bè cùng chơi tennis"><div><p>KHÔNG GIAN CỦA BẠN</p><h2>Giữ nhịp chơi.<br>Kết nối mỗi ngày.</h2><small>Ảnh minh họa</small></div></div><section class="panel auth-panel"><span class="auth-emblem">${icon("user")}</span><h2>${reset ? "Lấy lại quyền truy cập" : "Chào mừng đến N01SPORT"}</h2><p>${reset ? "Liên kết chỉ dùng một lần, hết hạn sau 30 phút." : "Nếu chưa có tài khoản, đăng ký tại trang tìm sân."}</p>${button(
    reset ? "Đặt mật khẩu mới" : "Đăng nhập",
    () =>
      reset
        ? edit(
            "Đặt mật khẩu",
            [field("password", "Mật khẩu mới", "password")],
            {},
            async (b) => {
              await api("/api/auth/reset", "POST", { ...b, token: reset });
              location.hash = "";
              await boot();
            },
          )
        : edit(
            "Đăng nhập",
            [
              field("email", "Email", "email"),
              field("password", "Mật khẩu", "password"),
            ],
            {},
            async (b) => {
              await api("/api/auth/login", "POST", b);
              await boot();
            },
          ),
    "primary",
  )} ${button("Quên mật khẩu", () =>
    edit(
      "Khôi phục mật khẩu",
      [field("email", "Email đăng ký", "email")],
      {},
      async (b) => {
        const d = await api("/api/auth/forgot", "POST", b);
        toast(d.message);
      },
    ),
  )}<a class="text-link" href="/">Khám phá sân trước khi đăng nhập →</a></section></div>`;
}
async function route() {
  const version = ++routeVersion;
  $("#workspace-sidebar").classList.remove("nav-open");
  $("#nav-toggle").setAttribute("aria-expanded", "false");
  const hash = location.hash.slice(1),
    [key, id] = hash.split("=");
  for (const a of $("#navigation").querySelectorAll("a")) {
    if (a.dataset.tab === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  try {
    if (key === "reset") await authScreen(id);
    else if (!user) await authScreen();
    else if (key === "payment") await payment(Number(id));
    else if (key === "invoice") await invoice(Number(id));
    else if (key === "ticket") await ticket(Number(id));
    else {
      const f = {
        overview,
        profile,
        bookings,
        notifications,
        loyalty,
        support,
        orders,
        staff,
        work,
        reception,
        maintenance,
        refunds,
        coach,
        transactions,
        reports,
        adminvenues: adminVenues,
        audit,
        backups,
        events,
        errors,
      }[key];
      if (f) await f();
      else if (resourceConfigs[key]) await resource(key);
      else {
        const tabs = navigation();
        location.hash = tabs[0][0];
        return;
      }
    }
  } catch (e) {
    if (version === routeVersion)
      view.innerHTML = `<div class="empty" role="alert">${escape(e.message)} ${button("Thử lại", () => route())}</div>`;
  } finally {
    view.setAttribute("aria-busy", "false");
  }
}
async function boot() {
  const d = await api("/api/auth/me");
  user = d.user;
  if (user) {
    options = await api("/api/portal/options");
    $("#identity").textContent = user.full_name + " · " + labels[user.role];
    $("#logout").hidden = false;
    $("#sidebar-name").textContent = user.full_name;
    $("#sidebar-role").textContent = labels[user.role];
    $("#sidebar-avatar").textContent = user.full_name
      .trim()
      .slice(0, 1)
      .toUpperCase();
    $("#workspace-context").textContent =
      "N01SPORT / " + labels[user.role].toUpperCase();
    navigation();
  }
  await route();
}
$("#logout").onclick = async () => {
  await api("/api/auth/logout", "POST", {});
  location.href = "/";
};
$("#navigation").addEventListener("click", (e) => {
  if (!e.target.closest("a")) return;
  const mobile = $("#nav-toggle").getBoundingClientRect().height > 0;
  $("#workspace-sidebar").classList.remove("nav-open");
  $("#nav-toggle").setAttribute("aria-expanded", "false");
  if (mobile) $("#content").focus({ preventScroll: true });
});
$("#nav-toggle").onclick = () => {
  const open = $("#workspace-sidebar").classList.toggle("nav-open");
  $("#nav-toggle").setAttribute("aria-expanded", String(open));
};
window.addEventListener("hashchange", () => route());
boot().catch((e) => {
  page("Dịch vụ tạm thời không sẵn sàng");
  view.textContent = e.message;
});
