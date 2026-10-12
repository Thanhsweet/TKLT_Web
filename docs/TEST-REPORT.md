# Kiểm thử bản vá Windows

14/14 unit/HTTP test đạt. Kiểm tra đường dẫn với node:path.win32 và node:path.posix, chặn đường dẫn ra ngoài public và khác ổ đĩa. HTTP trên Linux tải được trang chủ, CSS, JS và WebP. Chưa chạy Node trực tiếp trên Windows; kiểm thử giao diện 3.2 bên dưới là đợt trước bản vá.

# Kiểm thử giao diện N01SPORT 3.2

Ngày 12/10/2026, từ gói N01SPORT_Web_MySQL_v3.1(1).zip trong cuộc trò chuyện.

| Kiểm tra đã chạy lại | Kết quả |
|---|---|
| Cú pháp JavaScript | Đạt |
| Unit / HTTP / security / validation | 13/13 đạt |
| API / nghiệp vụ với MySQL 8.4.11 thật | 18/18 đạt; có backup/restore SQL thật |
| UI fixtures Chromium | 7 vai trò, 375/1440px, form quản lý đạt |
| UI live Chromium + MySQL | 66 màn hình thuộc 7 vai trò tại 375px; không JS error, API 500 hay tràn ngang |
| Responsive trang chủ, chi tiết, chính sách | 375 / 768 / 1024 / 1440px đạt; các ảnh tải thành công |
| Bộ lọc & sắp xếp | Giá tăng dần đúng thứ tự, ngân sách giảm kết quả, lọc trong nhà, xóa bộ lọc khôi phục danh sách |
| Menu tài khoản trên mobile | Mở menu, vào Sân thể thao, menu đóng lại |
| Chi tiết sân thật | sport_slug đúng, amenities là danh sách từ MySQL |
| Đặt sân qua giao diện | Khách chọn giờ, đăng nhập, trở lại đúng sân/ngày, tải lại slot và tạo booking thành công |
| Kiểm tra trực quan | Xem ảnh chụp trang chủ desktop/mobile, chi tiết sân, tổng quan chủ sân và hộp đặt lịch |

Không có migration mới. Kiểm thử migration, npm audit và triển khai trong báo cáo 3.1 bên dưới là kết quả trước đó, không được trình bày như chạy lại trong đợt giao diện 3.2. Bản này chưa được triển khai lên hosting thật; chưa kiểm thử Safari/Firefox, tải đồng thời lớn, SMTP hay thanh toán ngân hàng thật. Ảnh chụp kiểm thử không nằm trong gói bàn giao; có thể tạo lại bằng các lệnh test.

---

# Báo cáo kiểm thử N01SPORT 3.1

Ngày 09/10/2026. Mã nguồn dùng chính bản N01 của cuộc trò chuyện, giữ HTML/CSS/JavaScript, backend Node.js và MySQL.

## Kết quả đã chạy

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| npm run check | Đạt | Cú pháp backend/frontend/scripts/tests |
| npm test | 13/13 | Mật khẩu scrypt, ngày/giờ/slot, CSRF, HTTP, webhook và hợp nhất lịch bảo trì |
| npm run test:integration | 18/18 | API HTTP thật + MySQL Community Server 8.4.11, không dùng mock database |
| npm run test:schema | Đạt | Nâng cấp 32 → 44 bảng, giữ tài khoản v2, migration chạy lại; cài sạch không demo; tạo admin |
| npm run test:ui | Đạt | Chromium, API fixtures, 7 vai trò, 375/1440px, form bảng giá/cấu hình |
| npm run test:ui:live | Đạt | Chromium + API/MySQL thật, 59 màn hình xác thực của 7 vai trò ở 375px, trang công khai 1440px; không JS error, API 500 hoặc tràn ngang |
| Sao lưu/phục hồi | Đạt | mysqldump thật, SHA-256 khớp, mysql phục hồi vào database khác, số booking khớp |
| npm audit --omit=dev | 0 advisory được báo | Kết quả tại thời điểm kiểm tra; không thay thế rà soát bảo mật độc lập |

Integration bao gồm đặt đồng thời (1 thành công/1 xung đột), slot không hợp lệ, hủy vẫn giữ lịch khi chờ duyệt, giới hạn phân quyền, xuất tồn/trả dụng cụ lặp, nhân viên sai hoặc ngừng phân công, đổi điểm/hỗ trợ, lịch HLV/đổi giờ, webhook đúng/sai tiền/sai khóa/lặp, đơn dịch vụ hết hạn hoàn tồn một lần, check-in/hoàn tất/điểm/vệ sinh/đánh giá, thu ròng và lịch bảo trì chồng, reset token dùng một lần và hủy session. Webhook là HTTP có payload kiểm thử ghi vào MySQL thật; không phải giao dịch ngân hàng thật.

UI live kiểm tra đăng nhập bằng form, tải các màn hình với API thật và bố cục. Không thay thế nghiệm thu thủ công mọi nút và quy trình kinh doanh.

## Chưa chạy

- VPS/DNS/HTTPS production, build và chạy compose.production.yml.
- SMTP nhà cung cấp thật, giao dịch SePay/ngân hàng thật, chuyển khoản hoàn tiền thật.
- Load test, pentest và giám sát dài hạn. Cấu hình hiện dành cho một app + một worker.

## Chạy lại MySQL test trên Windows

Dùng database **riêng**, DB_NAME phải kết thúc `_test`. Không dùng database đang vận hành. `test:schema` tạo/xóa hai database dẫn xuất có hậu tố `_upgrade_test` và `_install_test`; chỉ dùng tài khoản test được cấp quyền trên các database này.

```powershell
npm ci
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_USER="tai_khoan_test"
$env:DB_PASSWORD="mat_khau_test"
$env:DB_NAME="n01sport_test"
$env:NODE_ENV="test"
$env:PAYMENT_MODE="demo"
$env:PUBLIC_URL="http://localhost:3000"
npm run test:schema
npm run db:demo
npm run test:integration
```

Integration tạo booking/đơn/điểm và không tự xóa dữ liệu. Chuẩn bị database test mới trước mỗi lần chạy; không chạy db:demo trên dữ liệu thật. Phần dump/restore chỉ chạy khi MYSQLDUMP_BIN và MYSQL_BIN đều có; đặt đường dẫn thực và BACKUP_DIR riêng. Database phục hồi là DB_NAME + `_recovery` và test sẽ thay bản phục hồi test cũ.

## Kiểm tra trình duyệt

Giữ các biến test ở terminal riêng như trên. Sau khi seed và integration:

```powershell
$env:BROWSER_EXECUTABLE="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run test:ui
npm run test:ui:live
```

Linux tương thích có thể dùng Chromium đi kèm dependency mà không cần BROWSER_EXECUTABLE. Trên Windows đặt đúng đường dẫn Chrome đã cài. Ảnh nằm trong test-results. Đóng terminal test để tránh giữ cấu hình database test khi chạy ứng dụng thật.

## Nghiệm thu trên hạ tầng đích

Theo DEPLOYMENT.md/PAYMENTS.md: kiểm tra email/reset, QR và webhook đúng/sai/lặp/hết hạn, đối chiếu sao kê, quyền nhân viên, hoàn tiền có chứng từ, backup SQL + ảnh và phục hồi sang DB mới. Đổi các tài khoản demo, thông tin liên hệ, điều khoản, ảnh sân và tài khoản nhận tiền trước khi mở cho khách.
