# Workflow v3

## Đặt và thanh toán

Tìm/lọc/chi tiết → chọn slot → server kiểm tra giờ/trạng thái/bảo trì → khóa sân trong transaction → tính giá/khuyến mãi → booking pending/payment → QR → webhook kiểm tra khóa/mã/tài khoản/tiền/hạn → confirmed. Hết hạn chưa thanh toán: expired/payment failed, nhả lịch.

HLV định kỳ: khóa sân → kiểm tra tất cả 2–12 buổi → tạo series/booking/lớp → commit tất cả hoặc rollback. Thanh toán từng buổi; buổi chưa trả hết hạn riêng.

## Hủy và hoàn

Pending chưa trả → cancelled. Confirmed → cancel_requested/refund pending, vẫn giữ slot. Từ chối → confirmed. Duyệt → cancelled/payment refund_pending. Chủ sân chuyển khoản thật → nhập chứng từ → refunded. Gửi yêu cầu trước giờ bắt đầu; xử lý dịch vụ trước khi hủy.

## Dịch vụ và thuê

Booking confirmed/checked_in → chọn hàng → khóa theo ID → kiểm tra/trừ tồn khả dụng → pending. Thu tiền/chứng từ → paid. Bàn giao → delivered; không thuê thành completed. Thuê nhận lại → tăng tồn số nhận lại, ghi mất/hỏng/phí/chứng từ → completed. Không cộng tồn lần hai. Hủy hoặc pending quá 30 phút → trả tồn/cancelled.

## Sử dụng và vệ sinh

Confirmed → lễ tân check-in trong 30 phút trước giờ → checked_in → xử lý xong dịch vụ → completed → cộng điểm một lần/tạo vệ sinh. Khách vắng ghi sau giờ bắt đầu. Vệ sinh pending → assigned → in_progress → completed → sân ready. Blocked tạo yêu cầu kỹ thuật và thông báo chủ sân.

## Kỹ thuật, điểm, hỗ trợ, backup

Sự cố → open/assigned → nhận → in_progress → resolved hoặc waiting_approval/thời gian đề xuất. Chủ sân phân công/duyệt, chỉ chặn khi không trùng booking giữ/đã xác nhận. Closed mở block gắn yêu cầu; block riêng tắt ở Lịch chặn.

Hoàn booking → điểm/lịch sử. Đổi ưu đãi → khóa reward/user → trừ điểm + mã cá nhân một lượt/30 ngày.

Ticket → chủ sân cơ sở/admin → trao đổi/trạng thái → thông báo khách.

Sao lưu queued → worker running → file SQL/SHA-256 → completed hoặc failed. Phục hồi CLI vào DB mới, kiểm tra rồi chuyển app trong đợt bảo trì.
