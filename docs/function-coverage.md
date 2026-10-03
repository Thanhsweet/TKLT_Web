# Đối chiếu chức năng với PPT phân rã

| Nhóm | Trạng thái | Nội dung trong bản MySQL |
|---|---|---|
| C1 tài khoản | Hoàn thành cốt lõi | Đăng ký, đăng nhập, đăng xuất, cập nhật hồ sơ, session HttpOnly |
| C2 thông báo | Hoàn thành backend | Lưu thông báo booking, thanh toán, hoàn tiền và API tra cứu |
| A1 tài khoản và quyền | Hoàn thành cốt lõi | Tạo tài khoản, đổi vai trò/trạng thái, khóa phiên đăng nhập |
| A2 cấu hình và sao lưu | Có cấu trúc | `site_settings`, `backup_jobs`; cần worker `mysqldump` khi triển khai thật |
| M1 sân | Hoàn thành cốt lõi | Danh sách, thêm, sửa trạng thái và giữ lịch sử |
| M2 lịch và bảng giá | Hoàn thành backend | Giá theo ngày/giờ, giờ mở cửa, lịch trống, chỉ mục truy vấn |
| M3 khuyến mãi | Hoàn thành cốt lõi | Tạo, giới hạn tổng lượt và lượt mỗi khách, phạm vi cơ sở |
| M4 nhân viên | Hoàn thành cốt lõi | Tạo tài khoản, vị trí, cơ sở và ca làm |
| M5 dịch vụ | Hoàn thành cốt lõi | Bán hàng, thuê đồ, kỹ thuật và tồn kho |
| M6 báo cáo | Hoàn thành cốt lõi | Doanh thu đã thu, booking, hiệu suất sân, giao dịch |
| K1 tra cứu | Hoàn thành | Tìm, lọc, chi tiết thẻ sân, lịch trống và yêu thích |
| K2 đặt sân | Hoàn thành | Transaction, giữ chỗ 10 phút, khuyến mãi, chống trùng |
| K3 thanh toán | Mô phỏng hoàn chỉnh | QR nội bộ, trạng thái thanh toán, xác nhận và hết hạn |
| K4 quyền lợi | Hoàn thành cốt lõi | Điểm, lịch sử booking, giao dịch và khuyến mãi |
| H HLV | Có cấu trúc dữ liệu | Tài khoản HLV, chuỗi booking và lịch dạy; chưa mở form chuỗi |
| R lễ tân | Hoàn thành cốt lõi | Đặt tại quầy không cần tài khoản khách, thu tiền mặt/chuyển khoản hoặc thu sau, lịch theo ngày, check-in, khách vắng, hoàn tất |
| R bán/thuê | Hoàn thành dữ liệu | Booking service và equipment rental; UI thao tác chi tiết là bước mở rộng |
| T kỹ thuật | Hoàn thành cốt lõi | Nhận việc, tiến độ, hoàn thành, bảo trì và chặn lịch |
| V vệ sinh | Hoàn thành | Nhiệm vụ tự sinh, bắt đầu, hoàn tất, báo sự cố |
| S tự động | Hoàn thành cốt lõi | Phân quyền, xung đột lịch, tính giá, hết hạn giữ chỗ, thông báo, điểm |

## Chức năng cần dịch vụ bên ngoài khi triển khai production

- Thanh toán QR ngân hàng thật và webhook đối soát.
- Gửi email, SMS hoặc thông báo đẩy.
- Worker sao lưu MySQL và kho lưu trữ file.
- GPS, bản đồ và tìm kiếm theo khoảng cách thực tế.
