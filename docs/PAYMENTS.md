# Thanh toán sân qua SePay Webhooks

Tiền sân thanh toán toàn bộ qua chuyển khoản QR vào ngân hàng chủ sân; web đối soát webhook để xác nhận. Dịch vụ/F&B/thuê dụng cụ thu tại quầy có chứng từ. Hoàn tiền do chủ sân chuyển thực tế rồi lưu mã chứng từ, chưa có API tự chuyển tiền ra ngân hàng.

## Thiết lập

1. Có ngân hàng và tài khoản SePay; liên kết ngân hàng theo hướng dẫn nhà cung cấp.
2. Chủ sân nhập mã ngân hàng (VCB/MB/ACB…), số và tên tài khoản nhận cho từng cơ sở. Không dùng số tài khoản mẫu để nhận tiền.
3. Tạo webhook POST JSON, URL https://tenmiencuaban.vn/api/webhooks/sepay, giao dịch tiền vào.
4. Xác thực API Key; nhập cùng SEPAY_WEBHOOK_KEY với server. Header kiểm tra: Authorization: Apikey <khóa>.
5. Kiểm thử Test Mode/staging trước. QR hiện dùng qr.sepay.vn; ứng dụng chưa tự thay QR Live bằng QR sandbox. Thiết lập sandbox theo hướng dẫn SePay.
6. Kiểm tra nhận webhook, booking confirmed, thông báo và audit; sau đó mới dùng Live.

Booking mới: N01-<16 ký tự hex>. Nội dung chuyển khoản: N01<16 ký tự>, bỏ gạch. Web đọc content gốc, không phụ thuộc trường code của nhà cung cấp.

## Đối chiếu

Khóa đúng; transferType=in; id và transferAmount là số nguyên dương; mã booking trong content; accountNumber khớp cơ sở; số tiền đúng total_amount; booking pending trong hạn; provider bank_transfer. UNIQUE(provider,event_id) ngăn xử lý lặp. Đơn miễn phí sau giảm giá được xác nhận không cần chuyển tiền.

Sai tiền, hết hạn, thiếu mã hoặc thanh toán lần hai được lưu để đối soát, không tự xác nhận slot đã hết hạn hoặc bị người khác đặt. Admin xem Đối soát ngân hàng, liên hệ khách/chủ sân; tiền chưa khớp phải được xử lý thực tế và lưu hồ sơ hỗ trợ/chứng từ. Không dùng demo để xác nhận tiền thật.

Endpoint trả {"success":true} sau commit. Lỗi database trả lỗi để nhà cung cấp gửi lại. Không tin nút "đã chuyển tiền" từ trình duyệt khách.

Một endpoint/key cho đơn vị vận hành. Nhiều chủ sân có SePay riêng cần thống nhất cấu hình webhook về endpoint/key này; không đưa khóa lên frontend. Mô hình OAuth nhiều đối tác chưa triển khai.

## Tài liệu chính thức

- https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
- https://developer.sepay.vn/en/sepay-webhooks/tao-qr-va-form-thanh-toan
- https://developer.sepay.vn/en/tien-ich-khac/tao-qr-code

Tự kiểm tra ngân hàng hỗ trợ, gói dịch vụ và điều kiện hiện hành. Gói mã nguồn không bao gồm phí hoặc tài khoản nhà cung cấp.
