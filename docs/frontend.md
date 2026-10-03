# Cấu trúc JavaScript giao diện

Frontend dùng ES modules gốc của trình duyệt. `public/index.html` nạp `public/js/app.js` bằng `type="module"`; chạy website qua `npm start` hoặc `npm run dev`, không mở trực tiếp HTML bằng `file://`. Không cần bundler hay thư viện mới.

| File trong `public/js/` | Khi nào cần sửa |
|---|---|
| `app.js` | Khởi tạo ứng dụng, ngày mặc định và gắn sự kiện các nút/form |
| `core/state.js` | Dữ liệu dùng chung giữa các màn hình |
| `core/api.js` | Gọi API, cookie phiên đăng nhập và xử lý lỗi HTTP |
| `core/dom.js` | Truy vấn DOM, thông báo toast, mở/đóng dialog |
| `core/format.js` | Định dạng tiền, ngày giờ, tên trạng thái và escape HTML |
| `session.js` | Kiểm tra vai trò, hiển thị thông tin tài khoản trên header |
| `auth.js` | Đăng nhập, đăng ký, đăng xuất và tài khoản demo |
| `courts.js` | Tìm/lọc sân, thẻ sân và yêu thích |
| `bookings.js` | Chọn giờ, đặt online/tại quầy, thanh toán, lịch sử, hủy và đánh giá |
| `management/index.js` | Tải dashboard, chuyển tab và xử lý thao tác quản lý |
| `management/owner-view.js` | Các bảng của chủ sân |
| `management/admin-view.js` | Các bảng của quản trị viên |
| `management/staff-view.js` | Lịch lễ tân, kỹ thuật và vệ sinh |
| `management/forms.js` | Form thêm sân, nhân viên, dịch vụ, khuyến mãi và báo sự cố |
| `management/components.js` | HTML bảng và nút thao tác dùng chung |

## Quy tắc khi bổ sung chức năng

- Import trực tiếp từ module sở hữu chức năng; chỉ export các hàm được dùng bên ngoài.
- Các module `core/` không import các module tính năng. `session.js` chỉ phụ thuộc `core/`.
- Dùng chung một đối tượng `state`, tránh tạo bản sao trạng thái riêng cho mỗi màn hình.
- `app.js` nối thao tác chọn sân với `openBooking` bằng `bindCourtEvents(openBooking)`. Cách này tránh vòng import giữa danh sách sân và đặt sân; sự kiện vẫn hoạt động sau khi danh sách được dựng lại.
- Không import `app.js` từ module khác: đây là điểm khởi động và tự chạy ứng dụng.
- Dùng `escapeHtml` khi đưa dữ liệu người dùng vào chuỗi HTML và `api` khi gọi backend.

## Kiểm tra sau khi sửa

`npm run check` tự tìm và kiểm tra cú pháp mọi file JavaScript trong frontend, backend, scripts và tests. `npm test` chạy kiểm thử; trong môi trường hạn chế tiến trình con dùng `node --test --test-isolation=none tests/*.test.js`.

Kiểm thử frontend import các ES module thật, giả lập DOM và phản hồi HTTP ở ranh giới `fetch`; không nối lại mã nguồn thành một file. Bộ kiểm thử bao gồm đặt sân tại quầy, bỏ qua phản hồi lịch cũ, nút chọn sân sau khi tải lại, các màn hình quản lý và khởi động từ `app.js`.

Sau cập nhật, tải lại trang. Entry point có tham số phiên bản để tránh bản `app.js` cũ đã được trình duyệt lưu. Server dùng `Cache-Control: no-cache` cho HTML/JS/CSS để trình duyệt kiểm tra lại nội dung ở lần tải kế tiếp; cần khởi động lại server để áp dụng thay đổi header này.
