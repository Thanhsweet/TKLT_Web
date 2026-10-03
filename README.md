# N01SPORT MySQL

Website quản lý và đặt sân thể thao hoàn chỉnh, dùng HTML/CSS/JavaScript thuần ở frontend, Node.js ở backend và MySQL 8.4 làm hệ quản trị cơ sở dữ liệu.

## Chức năng chính

### Khách hàng và huấn luyện viên

- Đăng ký, đăng nhập, đăng xuất, cập nhật hồ sơ.
- Tìm và lọc sân theo môn, khu vực, tên hoặc địa chỉ.
- Xem lịch trống, giá theo khung giờ và thời gian bảo trì.
- Lưu địa điểm yêu thích.
- Giữ chỗ 10 phút, kiểm tra trùng lịch trong transaction.
- Áp mã khuyến mãi, xem nội dung QR và thanh toán mô phỏng.
- Theo dõi lịch sử, gửi yêu cầu hủy, đánh giá sau khi hoàn tất.
- Tích điểm khi lễ tân hoàn tất booking.
- Cấu trúc dữ liệu hỗ trợ HLV đặt sân theo chuỗi định kỳ.

### Chủ sân

- Dashboard số sân, booking, doanh thu đã thu và hiệu suất sân.
- Thêm sân, thay đổi thông tin hoặc trạng thái hoạt động.
- Tạo khuyến mãi, dịch vụ bán hàng, cho thuê hoặc kỹ thuật.
- Tạo tài khoản lễ tân, kỹ thuật, vệ sinh và phân ca theo cơ sở.
- Theo dõi yêu cầu bảo trì và chặn lịch trong khoảng bảo trì.
- Duyệt yêu cầu hủy và theo dõi hoàn tiền.

### Nhân viên vận hành

- Lễ tân: đặt sân tại quầy cho khách không cần tài khoản, nhập tên/số điện thoại, ghi nhận tiền mặt/chuyển khoản hoặc thu sau; xem booking theo ngày, check-in, ghi nhận khách vắng, hoàn tất booking.
- Kỹ thuật: nhận việc, cập nhật tiến độ và hoàn thành yêu cầu bảo trì.
- Vệ sinh: nhận nhiệm vụ, bắt đầu, hoàn tất hoặc báo sự cố bàn giao sân.
- Khi booking hoàn tất, hệ thống tự tạo nhiệm vụ vệ sinh và cộng điểm một lần.

### Quản trị viên

- Xem thống kê toàn hệ thống.
- Tạo tài khoản vận hành, khóa hoặc mở tài khoản.
- Duyệt hoặc tạm dừng địa điểm.
- Xem nhật ký thao tác quản trị và vận hành.
- Tạo yêu cầu sao lưu để tích hợp tiến trình `mysqldump` trên máy chủ.

## Cấu trúc dự án

```text
_Web/
├── database/
│   ├── mysql.js          # Pool kết nối mysql2
│   ├── schema.sql        # 32 bảng MySQL/InnoDB
│   ├── seed.sql          # Danh mục hệ thống
│   ├── setup.js          # Tạo database và dữ liệu demo
│   └── ERD.md            # Quan hệ dữ liệu theo phân hệ
├── docs/
│   ├── workflows.md
│   └── function-coverage.md
├── lib/security.js
├── public/
│   ├── css/styles.css
│   ├── js/
│   │   ├── app.js        # Khởi tạo và gắn sự kiện
│   │   ├── core/         # State, API, DOM, định dạng
│   │   ├── auth.js       # Đăng nhập, đăng ký, đăng xuất
│   │   ├── session.js    # Vai trò và thông tin phiên
│   │   ├── courts.js     # Tìm sân và yêu thích
│   │   ├── bookings.js   # Đặt sân online/tại quầy, lịch sử
│   │   └── management/  # Dashboard, form và view từng vai trò
│   ├── favicon.svg
│   └── index.html
├── tests/project.test.js
├── docker-compose.yml
├── server.js
└── package.json
```

Xem [hướng dẫn cấu trúc frontend](docs/frontend.md) để biết chức năng nằm ở file nào và cách thêm module.

## Cách 1: chạy bằng Docker, khuyến nghị

Yêu cầu: Docker Desktop và Node.js 22 trở lên.

Mở PowerShell tại thư mục dự án:

```powershell
cd C:\Users\Admin\source\TKLT\_Web
Copy-Item .env.example .env
# Sửa DB_PASSWORD và MYSQL_ROOT_PASSWORD trong .env trước khi chạy Docker.
docker compose up -d
npm install
npm run db:reset
npm start
```

Mở website:

```text
http://127.0.0.1:3000
```

Mở phpMyAdmin:

```text
http://127.0.0.1:8080
```

Thông tin phpMyAdmin:

```text
Server: mysql
User: n01sport_user
Password: giá trị DB_PASSWORD trong file .env của bạn
```

## Cách 2: MySQL Workbench hoặc XAMPP

1. Cài MySQL 8.0 trở lên và bật MySQL Server.
2. Tạo tài khoản và cấp quyền:

```sql
CREATE DATABASE n01sport CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'n01sport_user'@'localhost' IDENTIFIED BY '<MAT_KHAU_DATABASE_CUA_BAN>';
GRANT ALL PRIVILEGES ON n01sport.* TO 'n01sport_user'@'localhost';
FLUSH PRIVILEGES;
```

3. Tạo `.env` từ `.env.example` và sửa đúng thông tin MySQL.
4. Chạy:

```powershell
npm install
npm run db:init
npm start
```

Nếu dùng XAMPP với tài khoản `root` không có mật khẩu:

```env
DB_USER=root
DB_PASSWORD=
```

## Lệnh dự án

```powershell
npm run db:init    # Tạo bảng nếu chưa có, giữ dữ liệu hiện tại
npm run db:reset   # Xóa database và tạo lại toàn bộ dữ liệu mẫu
npm start          # Chạy website
npm run dev        # Chạy chế độ tự nạp lại khi sửa code
npm run check      # Kiểm tra cú pháp JavaScript
npm test           # Kiểm thử cấu trúc và logic bảo mật
```

Sau khi cập nhật, khởi động lại server. Hệ thống tự bổ sung cột khách đặt trực tiếp vào database hiện có, giữ nguyên dữ liệu và không cần `db:reset`.

Để đặt tại quầy: đăng nhập lễ tân → khu vực quản lý → **Đặt sân cho khách** → chọn sân, tên/số điện thoại, ngày/giờ và tình trạng thu tiền. Đơn được xác nhận ngay cả khi chưa thu tiền; dùng **Đã nhận tiền mặt** hoặc **Đã nhận chuyển khoản** trên lịch lễ tân khi đã nhận đủ tiền. Chỉ các sân thuộc cơ sở có phân công lễ tân đang hoạt động được phép đặt. Khách đặt trực tiếp được lưu riêng, không cộng điểm vào tài khoản lễ tân.

Kiểm thử tích hợp HTTP/MySQL dùng dữ liệu riêng và tự dọn sau khi chạy:

```powershell
$env:N01_TEST_MYSQL = '1'
node --test --test-isolation=none tests/*.test.js
Remove-Item Env:N01_TEST_MYSQL
```

Có thể dùng `node --test --test-isolation=none tests/*.test.js` nếu môi trường không cho phép test runner tạo tiến trình con.

## Tài khoản demo

Các tài khoản dưới đây và nút đăng nhập demo là dữ liệu kiểm thử được công khai trong mã nguồn. Không dùng các mật khẩu này cho tài khoản thật hoặc triển khai production.

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Khách hàng | `khach@n01sport.vn` | `Khach@123` |
| Chủ sân | `chusan@n01sport.vn` | `ChuSan@123` |
| Lễ tân | `letan@n01sport.vn` | `LeTan@123` |
| Kỹ thuật | `kythuat@n01sport.vn` | `KyThuat@123` |
| Vệ sinh | `vesinh@n01sport.vn` | `VeSinh@123` |
| Huấn luyện viên | `hlv@n01sport.vn` | `HLV@12345` |
| Quản trị | `admin@n01sport.vn` | `Admin@123` |

## Nguyên tắc dữ liệu quan trọng

- Booking có trạng thái riêng với thanh toán.
- Booking `pending` chỉ chặn lịch khi `hold_expires_at > NOW()`.
- Backend dùng transaction và `SELECT ... FOR UPDATE` để chống đặt trùng.
- Khoảng bảo trì được lưu riêng và được kiểm tra khi tìm slot.
- Giá, mã ưu đãi và đơn giá dịch vụ được chốt tại thời điểm giao dịch.
- Khóa tài khoản xóa toàn bộ phiên đăng nhập đang hoạt động.
- Nhật ký quản trị lưu người thao tác, đối tượng và dữ liệu thay đổi.

## Phạm vi thanh toán và sao lưu

QR hiện là dữ liệu mô phỏng để kiểm thử workflow. Khi triển khai thật cần tích hợp API ngân hàng/VNPay/MoMo, kiểm tra chữ ký webhook và xử lý giao dịch lặp.

Nút tạo yêu cầu sao lưu chỉ ghi `backup_jobs`. Máy chủ production cần worker có quyền giới hạn để chạy `mysqldump`, mã hóa file và lưu ngoài máy chủ ứng dụng.
