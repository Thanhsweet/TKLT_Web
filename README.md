# N01SPORT 3.2 — HTML/CSS/JavaScript + Node.js + MySQL

Mã nguồn website đặt và quản lý sân thể thao. Bản 3 bổ sung các luồng vận hành, trang tài khoản theo 7 vai trò, migration nâng cấp từ v2 và cấu hình triển khai HTTPS trên VPS.

**Đây là gói mã nguồn để triển khai, chưa phải website đã được xuất bản.** Đã chạy kiểm thử logic/HTTP, MySQL 8.4.11, sao lưu/phục hồi thật và 66 màn hình trình duyệt theo vai trò cùng luồng đặt sân thực tế. Tài khoản ngân hàng, SMTP, VPS/tên miền của anh cần cấu hình và nghiệm thu trước khi nhận khách. Xem `docs/TEST-REPORT.md`.

## Giao diện 3.2

Nâng cấp từ đúng gói N01SPORT v3.1 của cuộc trò chuyện theo UI/UX Pro Max. Trang chủ, chi tiết sân, tài khoản và vận hành dùng chung bộ màu xanh rừng / xanh chanh / trắng ngà; 5 bộ ảnh minh họa WebP được đóng gói sẵn.

- Tìm sân: lọc trong/ngoài nhà, ngân sách mỗi lượt, sắp xếp giá/đánh giá, xóa bộ lọc.
- Chi tiết sân: hình ảnh, tiện ích, mặt sân, giờ hoạt động, đánh giá cơ sở và liên kết đặt lịch đúng sân.
- Tổng quan riêng theo vai trò, số liệu lấy từ API/MySQL, lối tắt công việc và menu chia nhóm.
- Bố cục điện thoại: menu mở/đóng, bảng chuyển thành thẻ; biểu mẫu và chọn giờ dễ thao tác.
- Chọn giờ khi chưa đăng nhập: đăng nhập xong quay lại đúng sân/ngày, cập nhật lịch trống để tiếp tục.

Hướng dẫn thiết kế và thay ảnh: `docs/DESIGN-SYSTEM.md`. Bản 3.2 không thêm bảng hoặc migration. Nếu đã chạy bản 3.1, giữ nguyên `.env`, database, thư mục ảnh tải lên và thư mục sao lưu; thay mã nguồn rồi chạy lại app/worker. **Không chạy db:demo hay db:reset khi nâng cấp.**

## Bắt đầu ở đâu?

- Đang dùng v2: làm theo mục **Nâng cấp từ bản cũ**, giữ lại database và file .env.
- Muốn thử trên Windows: làm theo **Chạy local**.
- Muốn cho mọi người truy cập: làm theo `docs/DEPLOYMENT.md` và `docs/PAYMENTS.md`.
- Hướng dẫn Windows từng bước: `docs/QUICKSTART-WINDOWS.md`.
- Xem chức năng: `docs/function-coverage.md`.
- Xem quan hệ bảng: `database/ERD.md`; import bằng Workbench: `database/full-schema.sql` (chọn database trước).

## Chạy local trên Windows

Node.js 22 trở lên; MySQL 8.4 (MySQL cài trực tiếp hoặc Docker). Docker không bắt buộc.

Giải nén để có thư mục `C:\Users\Admin\source\TKLT\_Web`. Mở PowerShell:

```powershell
cd C:\Users\Admin\source\TKLT\_Web
Copy-Item .env.example .env
npm ci --omit=dev
```

Nếu dùng MySQL cài trực tiếp: sửa DB_HOST, DB_PORT, DB_USER, DB_PASSWORD và DB_NAME trong .env cho đúng. Tài khoản cần quyền tạo/sửa bảng trong database n01sport. Không sử dụng root làm tài khoản ứng dụng khi public.

Nếu dùng Docker cho database local:

```powershell
docker compose up -d
```

Nạp dữ liệu demo vào một database riêng:

```powershell
npm run db:demo
npm start
```

Mở terminal thứ hai, cùng thư mục:

```powershell
npm run worker
```

Website: http://localhost:3000. Tài khoản và vận hành: http://localhost:3000/account.html.

PAYMENT_MODE=demo chỉ dùng để thử. Production chặn chế độ demo. Email cần SMTP; sao lưu cần mysqldump/mysql trong PATH. Worker phải chạy để gửi email, nhả tồn kho hết hạn và thực hiện sao lưu.

| Vai trò | Email demo | Mật khẩu |
|---|---|---|
| Khách | khach@n01sport.vn | Khach@123 |
| Chủ sân | chusan@n01sport.vn | ChuSan@123 |
| Lễ tân | letan@n01sport.vn | LeTan@123 |
| Admin | admin@n01sport.vn | Admin@123 |
| Kỹ thuật | kythuat@n01sport.vn | KyThuat@123 |
| Vệ sinh | vesinh@n01sport.vn | VeSinh@123 |
| HLV | hlv@n01sport.vn | HLV@12345 |

Không nạp demo vào database đã có dữ liệu thật: db:demo có thể cập nhật danh mục, tồn kho, vai trò và phân công mẫu. Lệnh db:reset chỉ chạy khi thêm --confirm và sẽ XÓA database; không dùng để nâng cấp.

## Nâng cấp từ bản cũ, giữ dữ liệu

1. Sao lưu database cũ bằng Workbench hoặc mysqldump; giữ bản sao thư mục v2.
2. Giải nén v3 vào thư mục mới để tránh ghi đè các sửa đổi riêng. Chuyển file .env và ảnh tự tải vào thư mục mới; không gửi .env cho người khác.
3. Trong .env giữ thông tin MySQL cũ. Thêm PUBLIC_URL=http://localhost:3000, PAYMENT_MODE=demo (local), các biến SMTP/SePay/backup từ .env.example nếu cần.
4. Chạy:

```powershell
npm ci --omit=dev
npm run db:migrate
npm run check
npm test
npm start
```

5. Chạy npm run worker ở terminal khác. Không chạy db:reset hoặc db:demo lên dữ liệu thật.
6. Nếu public từ dữ liệu demo cũ, đổi mật khẩu hoặc khóa các tài khoản còn dùng mật khẩu mặc định. Bản production kiểm tra và từ chối khởi động nếu còn tài khoản demo hoạt động.

Migration 003/004 chỉ thêm bảng và danh mục môn thể thao còn thiếu, không DROP bảng. Các bảng booking_services/equipment_rentals cũ được giữ; đơn dịch vụ v3 dùng service_orders/service_order_items để tách tiền dịch vụ khỏi khoản thanh toán sân.

## Cài mới bằng database trống

```powershell
npm run db:init
$env:ADMIN_EMAIL="admin@tenmiencuaban.vn"
$env:ADMIN_NAME="Quản trị N01"
$env:ADMIN_PASSWORD="mat-khau-rieng-it-nhat-12-ky-tu"
npm run admin:create
Remove-Item Env:ADMIN_PASSWORD
npm start
```

Không có tài khoản mặc định trong cách cài này. Admin tạo chủ sân; chủ sân thêm cơ sở; admin duyệt cơ sở; chủ sân thêm sân, bảng giá, ảnh, tài khoản ngân hàng và nhân viên.

## Chức năng vận hành

- Khách/HLV: hồ sơ, đổi/quên mật khẩu qua email, tìm sân gần vị trí, chi tiết sân/ảnh/đánh giá, slot trống, thanh toán QR, lịch/giao dịch/phiếu thu, hủy, đặt dịch vụ, điểm/đổi ưu đãi, thông báo, hỗ trợ.
- Chủ sân: cơ sở và giờ mở, sân, ảnh URL hoặc PNG/JPEG, bảng giá theo ngày/giờ, tài khoản nhận tiền, khuyến mãi, hàng hóa/tồn kho, đơn bán/thuê, nhân viên/ca, bảo trì, hoàn tiền, báo cáo/CSV.
- HLV: lớp học trên booking, chuỗi 2–12 tuần tạo trong một transaction, sửa lớp và đổi giờ khi không xung đột và giá không đổi; thanh toán từng buổi.
- Lễ tân: tra cứu booking theo ngày/tên/mã, check-in, khách vắng, hoàn tất, thu tiền/bàn giao/nhận lại dụng cụ, báo sự cố.
- Kỹ thuật/vệ sinh: nhận, bắt đầu, hoàn thành, đề xuất bảo trì và báo sự cố theo cơ sở được phân công.
- Admin: tài khoản/quyền/khóa, duyệt cơ sở, cấu hình, đối soát, báo cáo, nhật ký/lỗi, sao lưu SQL thực tế và tải file. Phục hồi qua CLI vào database mới.

Thanh toán sân tự động qua chuyển khoản + webhook SePay. Dịch vụ thu tại quầy. Hoàn tiền là chuyển khoản do chủ sân thực hiện và lưu chứng từ; chưa có API tự chuyển tiền hoàn. Phiếu thu nội bộ không phải hóa đơn điện tử thuế.

## Cấu trúc

```text
_Web/
  public/                Trang tìm sân, chi tiết, tài khoản, điều khoản; CSS và JS
  server.js              HTTP server và các API gốc
  lib/                   Booking, phân quyền tài nguyên, bảo mật, thanh toán, worker
  database/
    schema.sql           32 bảng nền
    migrations/          Bảng bổ sung cho phiên bản 3
    full-schema.sql      Schema tổng hợp để xem/import
    migrate.js           Nâng cấp có version, giữ dữ liệu
    setup.js             Khởi tạo sạch hoặc dữ liệu demo có chủ ý
    ERD.md               Quan hệ và lưu ý dữ liệu
  scripts/               Tạo admin, worker, phục hồi, kiểm tra, xuất schema
  tests/                 Unit/HTTP, MySQL integration, UI smoke
  docs/                  Triển khai, thanh toán, đối chiếu chức năng, kiểm thử
  deploy/Caddyfile        Reverse proxy HTTPS
  Dockerfile
  docker-compose.yml     Database/phpMyAdmin local
  compose.production.yml App + worker + MySQL + Caddy
  .github/workflows/     Kiểm thử với MySQL 8.4 trên CI
  .env.example
  .env.production.example
```

Đây là backend Node.js riêng; không thể chạy đầy đủ bằng cách chỉ tải HTML lên GitHub Pages hoặc hosting tĩnh.
