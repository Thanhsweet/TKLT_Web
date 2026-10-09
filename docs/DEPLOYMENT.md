# Triển khai N01SPORT trên mạng

Gói có cấu hình VPS và HTTPS, chưa có VPS/tên miền/ngân hàng/SePay/SMTP của người vận hành và chưa được xuất bản. Dùng một VPS Linux có Docker Engine + Compose, tên miền trỏ về IP VPS, cổng 80/443 mở. Cấu hình dành cho một app và một worker.

## 1. Cấu hình

Đưa _Web lên VPS, cd vào thư mục. Sao chép .env.production.example thành .env.production. Sửa DOMAIN (tên miền thực, không có https://), TLS_EMAIL, DB_PASSWORD, MYSQL_ROOT_PASSWORD, SEPAY_WEBHOOK_KEY, SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM.

Hai mật khẩu MySQL phải khác nhau và ngẫu nhiên, ít nhất 16 ký tự. Khóa webhook >=24 ký tự. Có thể tạo bằng node -e "console.log(require('crypto').randomBytes(24).toString('hex'))". Không để giá trị CHANGE_. Giữ cấu hình ngoài git, hạn chế quyền đọc.

## 2. Khởi tạo sạch, không demo

```bash
docker compose --env-file .env.production -f compose.production.yml up -d mysql
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml run --rm app npm run db:init
```

Nếu nâng cấp dữ liệu đã có: sao lưu trước, dùng db:migrate; không chạy db:demo hoặc db:reset.

## 3. Tạo admin

Đặt ADMIN_EMAIL/ADMIN_NAME và mật khẩu riêng >=12 ký tự. Ví dụ Bash (mật khẩu không lưu trong lịch sử lệnh):

```bash
read -r -s -p "Mat khau admin: " N01_ADMIN_PASSWORD
export N01_ADMIN_PASSWORD
docker compose --env-file .env.production -f compose.production.yml run --rm -e ADMIN_EMAIL=admin@tenmiencuaban.vn -e ADMIN_NAME="Quan tri N01" -e ADMIN_PASSWORD="$N01_ADMIN_PASSWORD" app npm run admin:create
unset N01_ADMIN_PASSWORD
```

## 4. Chạy

```bash
docker compose --env-file .env.production -f compose.production.yml up -d
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 app worker proxy
```

Caddy cấp/gia hạn HTTPS khi DNS và cổng đúng. Kiểm tra https://tenmiencuaban.vn/api/health và /account.html. App từ chối chạy nếu còn demo dùng mật khẩu mặc định, thiếu SMTP/khóa webhook hoặc cấu hình mẫu. Chỉ proxy có cổng public; MySQL/app nằm trong mạng Docker, không có port 3306/3000 public.

## 5. Thiết lập nghiệp vụ

1. Admin tạo chủ sân/HLV. Người được cấp đổi mật khẩu.
2. Chủ sân thêm cơ sở, giờ mở và tọa độ; admin duyệt cơ sở.
3. Chủ sân thêm sân, ảnh thật, giá mỗi slot và bảng giá đặc biệt. Bảng giá không nên chồng nhau; nếu chồng, ngày cụ thể ưu tiên rồi ID nhỏ hơn.
4. Cấu hình tài khoản ngân hàng từng cơ sở; thiết lập webhook theo PAYMENTS.md.
5. Thêm dịch vụ/tồn kho và nhân viên/ca.
6. Admin cập nhật tên, email, điện thoại, địa chỉ vận hành, điều khoản và quyền riêng tư phù hợp hoạt động thực tế.

## 6. Nghiệm thu trên staging

Mã nguồn đã qua kiểm thử MySQL 8.4.11 ở môi trường bàn giao. Chạy lại test MySQL riêng theo TEST-REPORT.md khi cài trên hạ tầng đích. Sau đó kiểm tra email/reset; hai khách đặt cùng slot; QR/webhook đúng, sai số tiền, lặp; hủy đang chờ vẫn giữ lịch; thu/bàn giao/nhận dụng cụ/tồn kho; nhân viên sai cơ sở; check-in/hoàn tất; hỗ trợ/điểm/HLV; sao lưu và phục hồi vào DB mới; điện thoại/máy tính. Chỉ nhận tiền thật sau nghiệm thu. Gói chưa được kiểm chứng bằng ngân hàng thật của người vận hành.

## Sao lưu và phục hồi

Admin: Sao lưu → Tạo bản sao lưu. Worker thực thi dump, tính SHA-256; tải SQL qua giao diện. Docker dùng MariaDB client tương thích để dump/restore, server vẫn là MySQL 8.4. Native MySQL client: bỏ trống MYSQLDUMP_FLAVOR hoặc đặt mysql.

File SQL chứa dữ liệu người dùng, chỉ admin tải được. Sao lưu database không gồm ảnh: tải SQL và ảnh uploads ra nơi khác VPS định kỳ. Volume cùng VPS không bảo vệ khỏi hỏng/mất VPS.

Phục hồi bằng máy có mysql client, dùng tài khoản DBA có quyền tạo database mới:

```bash
npm run db:restore -- duong-dan/backup.sql n01sport_recovery --confirm
```

Script từ chối target trùng DB_NAME và database đã tồn tại. Kiểm tra DB phục hồi, rồi chuyển DB_NAME/quyền ứng dụng trong đợt bảo trì; ghi lại lần phục hồi. Chỉ chạy backup do hệ thống tạo và tin cậy, không chạy SQL từ người lạ.

Cập nhật: sao lưu → dừng app/worker → build → run db:migrate → kiểm tra → up -d. Migration thất bại: giữ app dừng, xử lý trên bản sao. Không chạy down -v trừ khi chủ ý XÓA database/ảnh/sao lưu. docker-compose.yml dành cho local, không dùng làm production.

## Phạm vi vận hành

Danh sách giới hạn 200–500 dòng tùy mục. Khi dữ liệu lớn, bổ sung phân trang, báo cáo nền và đo hiệu năng. Chưa có SMS/push, MoMo/VNPay/thẻ, hóa đơn điện tử thuế, tự chuyển khoản hoàn tiền, nhiều app replicas, CDN/chống DDoS. Theo dõi log, CPU, ổ đĩa, lỗi và MySQL để mở rộng theo nhu cầu.

Tham chiếu: https://caddyserver.com/docs/automatic-https và https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html.
