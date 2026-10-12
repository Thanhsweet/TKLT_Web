# Bản vá Windows — 12/10/2026

Sửa kiểm tra thư mục public dùng path.relative theo hệ điều hành, thay phép so sánh publicDir + "/" gây HTTP 403 trên Windows. Bổ sung kiểm tra đường dẫn Windows/POSIX và tải HTML/CSS/JS/WebP.

# N01SPORT 3.2 — giao diện đồng bộ, 12/10/2026

- Áp dụng UI/UX Pro Max: hierarchy, shared tokens, SVG icons, focus, reduced motion, responsive và trạng thái tải/rỗng/lỗi.
- Thiết kế lại trang chủ theo bố cục ảnh thể thao lớn; đổi nhận diện xanh rừng, xanh chanh, trắng ngà trên mọi trang.
- Thêm 5 ảnh minh họa, bản WebP đầy đủ và 640px; ảnh cơ sở thực luôn được ưu tiên. Có nhãn minh họa và fallback khi ảnh cơ sở không tải được.
- Bộ lọc không gian / ngân sách, sắp xếp giá / đánh giá và xóa bộ lọc; xử lý response cũ khi tìm kiếm nhanh.
- Trang chi tiết sân hoàn chỉnh. API chi tiết bổ sung sport_slug, review_count và danh sách tiện ích, không đổi schema.
- Thêm trang Tổng quan cho 7 vai trò; menu quản lý chia nhóm và thu gọn trên điện thoại.
- Luồng khách chưa đăng nhập trở lại sân/ngày đã chọn sau đăng nhập, tải lại slot; tránh response cũ ghi đè khi đổi ngày nhanh.
- Thống nhất biểu mẫu, trạng thái có chữ, bảng/thẻ, tiêu đề trình duyệt và liên kết giữa các trang.
- Mở rộng kiểm thử trình duyệt: 4 kích thước màn hình, lọc/sắp xếp, ảnh, điều hướng, đăng nhập tiếp tục và tạo booking trên MySQL thật.
- Giữ nguyên backend Node.js/MySQL, phân quyền, thanh toán và cấu hình triển khai.

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
