# Chạy N01SPORT trên Windows bằng MySQL, không cần Docker

## 1. Chuẩn bị

Cài Node.js 22 trở lên, MySQL Server 8.4 và Workbench. Workbench là giao diện quản lý, MySQL Server mới là dịch vụ lưu database. Trong services.msc, dịch vụ MySQL phải Running.

Giải nén để package.json nằm trực tiếp tại `C:\Users\Admin\source\TKLT\_Web\package.json`. Nếu ZIP đã chứa `_Web`, giải nén vào `TKLT`, tránh `_Web\_Web`.

## 2. Tạo tài khoản riêng cho ứng dụng

Trong Workbench, đăng nhập root bằng mật khẩu MySQL của anh, mở SQL tab. Với cài mới, chạy:

```sql
CREATE DATABASE IF NOT EXISTS n01sport CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'n01sport_user'@'localhost' IDENTIFIED BY 'N01Sport@123';
GRANT ALL PRIVILEGES ON n01sport.* TO 'n01sport_user'@'localhost';
```

Mật khẩu trên dành cho local/demo; thay mật khẩu riêng khi triển khai công khai. Nếu tài khoản đã có, CREATE USER IF NOT EXISTS không thay mật khẩu: dùng đúng mật khẩu hiện có hoặc ALTER USER có chủ ý.

## 3. Kết nối backend

Mở PowerShell:

```powershell
cd C:\Users\Admin\source\TKLT\_Web
Copy-Item .env.example .env
npm ci --omit=dev
```

Sửa `.env` bằng trình soạn thảo:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=n01sport_user
DB_PASSWORD=N01Sport@123
DB_NAME=n01sport
PUBLIC_URL=http://localhost:3000
NODE_ENV=development
PAYMENT_MODE=demo
```

Không ghi đè `.env` cũ nếu nâng cấp v2. Giữ thông tin database cũ, thêm các biến mới từ `.env.example`.

## 4. Khởi tạo hoặc nâng cấp — chọn đúng trường hợp

- **Cài mới để thử trên database riêng:** `npm run db:demo`. Có 7 tài khoản thử ghi trong README.
- **Cài mới dùng dữ liệu thật:** `npm run db:init`, sau đó `npm run admin:create` theo README. Không có tài khoản mặc định.
- **Nâng cấp v2 đã có dữ liệu:** sao lưu trước, chạy `npm run db:migrate`. Không chạy db:demo/db:reset.

Xem bảng:

```sql
USE n01sport;
SHOW TABLES;
SELECT COUNT(*) AS total_tables FROM information_schema.tables WHERE table_schema='n01sport' AND table_type='BASE TABLE';
```

Sau migration có 44 bảng: 43 bảng nghiệp vụ/hệ thống và 1 bảng ghi version migration.

## 5. Chạy website và worker

Terminal thứ nhất:

```powershell
npm start
```

Terminal thứ hai, cùng thư mục:

```powershell
npm run worker
```

Mở `http://localhost:3000`; trang vận hành `http://localhost:3000/account.html`; kiểm tra MySQL `http://localhost:3000/api/health`.

Khách demo: `khach@n01sport.vn` / `Khach@123`. Chủ sân: `chusan@n01sport.vn` / `ChuSan@123`. Admin: `admin@n01sport.vn` / `Admin@123`.

Giữ hai terminal chạy khi sử dụng; Ctrl+C để dừng. Khi thay .env, dừng và chạy lại cả hai.

## 6. Sao lưu local

Nếu dùng MySQL cài trực tiếp, thêm thư mục bin của MySQL vào PATH hoặc đặt đường dẫn tuyệt đối `MYSQLDUMP_BIN` và `MYSQL_BIN` trong .env. Ví dụ:

```env
MYSQLDUMP_BIN="C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe"
MYSQL_BIN="C:/Program Files/MySQL/MySQL Server 8.4/bin/mysql.exe"
```

Admin → Sao lưu → Tạo bản sao lưu. Worker thực thi, admin tải file SQL khi hoàn tất. Phục hồi vào database mới theo DEPLOYMENT.md, dùng tài khoản DBA có quyền CREATE DATABASE.

## Lỗi thường gặp

- ECONNREFUSED: MySQL Server chưa chạy hoặc sai DB_PORT. Kiểm tra services.msc.
- Access denied: DB_USER/DB_PASSWORD không khớp. Thử tài khoản đó bằng Workbench.
- Unknown database: kiểm tra DB_NAME; cài mới chạy db:init.
- Thiếu bảng: chạy db:migrate, sau khi đã sao lưu.
- EADDRINUSE: cổng 3000 đang dùng; đổi PORT và PUBLIC_URL tương ứng hoặc tắt server cũ.
- Sai Origin: truy cập đúng PUBLIC_URL; nếu chọn localhost thì dùng localhost, nếu chọn 127.0.0.1 thì cấu hình đồng nhất.
- Đổi mật khẩu cần đăng nhập lại. Quên mật khẩu qua email cần SMTP và worker.

## Khi cho mọi người dùng trên mạng

Localhost chỉ là chạy trên máy anh. Triển khai Node.js + MySQL trên VPS với tên miền/HTTPS theo DEPLOYMENT.md; cấu hình SMTP và ngân hàng/SePay theo PAYMENTS.md. Không tải riêng HTML lên hosting tĩnh. Không dùng dữ liệu/tài khoản/mật khẩu demo để nhận khách thật.
