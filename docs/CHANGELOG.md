# N01SPORT 3.1 — bàn giao 09/10/2026

Tiếp tục từ mã nguồn N01 MySQL của chính cuộc trò chuyện. Giữ backend Node.js, MySQL và giao diện HTML/CSS/JavaScript; không thay bằng dự án bên ngoài.

- Hoàn thiện các màn hình theo 7 vai trò: khách, chủ sân, lễ tân, kỹ thuật, vệ sinh, HLV, admin.
- Hồ sơ/đổi/quên mật khẩu; sửa sân/ảnh/giờ/bảng giá; khuyến mãi/đổi điểm; lịch HLV; bán F&B và thuê/trả dụng cụ; thông báo/hỗ trợ; báo cáo/CSV; cấu hình/log/backup/restore.
- Validate giờ tương lai, giờ mở và slot tại server. Khóa hàng sân trong transaction để chống đặt đồng thời; cancel_requested vẫn chiếm lịch.
- Chặn nhân viên sai/ngừng phân công, chặn sửa loại dịch vụ có giao dịch và chuyển kho sang cơ sở khác.
- QR tiền sân + webhook SePay xác thực, chống lặp, kiểm tra số tiền/tài khoản/hạn giữ chỗ. Production tắt thanh toán demo; đổi ngân hàng khi có hold bị chặn.
- Dịch vụ thu tại quầy; hoàn tiền ngân hàng do chủ sân thực hiện và ghi chứng từ. Phiếu thu nội bộ.
- Báo cáo giữ tổng tiền đã thu, tách tiền đã hoàn và thu ròng; lịch bảo trì chồng chỉ trừ một lần. Dùng lịch hoạt động hiện tại, chưa lưu lịch sử thay đổi giờ mở.
- Migration giữ dữ liệu v2; 43 bảng nghiệp vụ/hệ thống + 1 bảng version. Cài sạch không tạo tài khoản demo.
- Thêm Dockerfile, app/worker/MySQL/Caddy HTTPS, cấu hình production và CI. Local không bắt buộc Docker.
- Kiểm thử MySQL và Chromium thật, backup/restore thật. Chi tiết và các điều kiện chưa được kiểm chứng có trong TEST-REPORT.md.
