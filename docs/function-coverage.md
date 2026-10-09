# Đối chiếu sơ đồ chức năng — v3.1

Phân loại theo mã nguồn/API/giao diện, đã kiểm thử trên MySQL 8.4.11 ở môi trường bàn giao; ngân hàng thật và hạ tầng đích cần nghiệm thu riêng.

| Nhóm | Luồng đã triển khai | Điều kiện/giới hạn |
|---|---|---|
| 1. Tài khoản | Đăng ký/đăng nhập/đăng xuất; hồ sơ; đổi/quên/reset mật khẩu; admin tạo/quyền/khóa | Khôi phục cần SMTP + worker; HLV do admin cấp |
| 2. Sân | Cơ sở/admin duyệt; thêm/sửa/ngừng sân; ảnh URL/tải PNG/JPEG; giờ mở; lịch; bảng giá; chặn/mở bảo trì | Ảnh <=600 KB; giá mỗi slot; giờ mở không qua nửa đêm |
| 3. Đặt/thanh toán | Tìm/lọc/chi tiết/gần vị trí; slot; giảm giá; giữ chỗ/chống trùng; QR; giao dịch; phiếu thu; hủy/duyệt hoàn | QR/đối soát cần SePay; phiếu thu nội bộ; hoàn tiền thủ công có chứng từ |
| 4. Dịch vụ | Danh mục/tồn; tạo đơn bán/thuê; giữ tồn; thu tại quầy; bàn giao; nhận lại/mất/hỏng/phí; kỹ thuật/tiến độ | Đơn v3 dùng service_orders/items, tiền tách khỏi tiền sân |
| 5. Nhân sự | Thêm/sửa/ngừng phân công; vị trí/ca; lễ tân tra cứu ngày/tên/mã, check-in/vắng/hoàn; kỹ thuật; vệ sinh/sự cố | Quyền theo cơ sở; chưa tự khóa quyền ngoài ca; một tài khoản một vai trò |
| 6. Khuyến mãi/điểm/HLV | Tạo/sửa/bật/tắt/hạn mức; cộng/lịch sử/đổi điểm; mã cá nhân; lớp/lịch tuần/đổi giờ | Chuỗi thanh toán từng buổi; đổi giờ cùng giá, giá khác hủy/đặt lại |
| 7. Thông báo/hỗ trợ | Trung tâm/đã đọc; đặt/thanh toán/hoàn/bảo trì/hỗ trợ; email; ticket/trao đổi/trạng thái | SMTP; chưa SMS/push |
| 8. Báo cáo | Tiền sân/dịch vụ, hoàn tiền và thu ròng theo ngày; lượt/tỷ lệ trừ bảo trì; sân đặt nhiều; cao điểm; khách/chi tiêu/điểm; CSV | Dùng giờ mở hiện tại và các block đang active; chưa lưu lịch sử đổi giờ mở; phí mất/hỏng gộp theo ngày thu đơn; khách mới trong tập có booking; chưa phân trang lớn |
| 9. Quản trị | Cấu hình/quyền/duyệt; log đăng nhập/thao tác/lỗi; đối soát; dump thực tế/tải/SHA-256; phục hồi CLI | Client+worker; phục hồi vào DB mới bởi DBA, không có nút phục hồi web |

Chưa tuyên bố hoàn thành: giao dịch ngân hàng thật, xuất bản VPS/tên miền, ví/thẻ, hóa đơn điện tử thuế, tự chuyển hoàn, OAuth nhiều chủ sân, SMS/push, nhiều app replicas, phân trang/báo cáo quy mô lớn. Xem DEPLOYMENT.md và TEST-REPORT.md.
