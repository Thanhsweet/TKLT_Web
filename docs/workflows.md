# Workflow hệ thống N01SPORT

## WF01 và WF02: đặt sân, giữ chỗ và thanh toán

```mermaid
flowchart TD
  A[Khách chọn sân và giờ] --> B[Kiểm tra lịch và bảo trì]
  B -->|Bị trùng| A
  B -->|Còn trống| C[Tính giá và khuyến mãi]
  C --> D[Khóa giao dịch và kiểm tra lại]
  D --> E[Tạo booking giữ 10 phút]
  E --> F[Hiển thị QR mô phỏng]
  F -->|Thanh toán hợp lệ| G[Xác nhận booking]
  F -->|Hết hạn| H[Giải phóng slot]
```

## Lễ tân đặt sân tại quầy

Lễ tân chọn **Đặt sân cho khách**, chọn sân thuộc cơ sở được phân công, nhập tên/số điện thoại và chọn ngày/khung giờ. Backend khóa sân và phân công, kiểm tra giờ mở cửa, trùng lịch và bảo trì, tính giá theo khung giờ rồi tạo booking `confirmed` không có thời hạn giữ chỗ. Khách không cần tài khoản. Có thể ghi nhận đã nhận tiền mặt/chuyển khoản khi tạo, hoặc để chưa thu và ghi nhận sau ở lịch lễ tân. Mỗi lần thu tiền được khóa giao dịch để ngăn ghi nhận lặp. Đơn có trong lịch theo ngày và báo cáo chủ sân; người thao tác được ghi vào audit log.

## WF03 và WF07: check-in, hoàn tất và vệ sinh

```mermaid
flowchart TD
  A[Lễ tân tra booking] --> B{Đã xác nhận?}
  B -->|Không| C[Thông báo không hợp lệ]
  B -->|Có| D[Check-in]
  D --> E[Sân đang sử dụng]
  E --> F[Lễ tân hoàn tất]
  F --> G[Tạo nhiệm vụ vệ sinh]
  G --> H[Nhân viên vệ sinh bắt đầu]
  H -->|Hoàn tất| I[Sân sẵn sàng]
  H -->|Có sự cố| J[Chuyển yêu cầu kỹ thuật]
```

## WF04 và WF05: dịch vụ phát sinh

```mermaid
flowchart TD
  A[Lễ tân chọn booking] --> B[Chọn dịch vụ hoặc đồ thuê]
  B --> C{Còn tồn kho?}
  C -->|Không| D[Đổi lựa chọn]
  C -->|Có| E[Lưu số lượng và đơn giá]
  E --> F{Loại dịch vụ}
  F -->|Bán| G[Giao hàng và giảm tồn]
  F -->|Thuê| H[Ghi nhận bàn giao và trả đồ]
  F -->|Kỹ thuật| I[Tạo yêu cầu kỹ thuật]
```

## WF06: bảo trì và chặn lịch

```mermaid
flowchart TD
  A[Báo sự cố] --> B[Kỹ thuật nhận việc]
  B --> C[Chủ sân duyệt khoảng bảo trì]
  C --> D[Chặn booking mới bị trùng]
  D --> E[Kỹ thuật xử lý]
  E --> F[Chủ sân đóng yêu cầu]
  F --> G[Mở lại sân]
```

## WF09, WF10 và WF14: quản lý dữ liệu

```mermaid
flowchart TD
  A[Người có quyền đăng nhập] --> B{Vai trò}
  B -->|Chủ sân| C[Quản lý sân, giá, dịch vụ, nhân viên]
  B -->|Quản trị| D[Quản lý tài khoản và địa điểm]
  C --> E[Kiểm tra dữ liệu và phạm vi sở hữu]
  D --> E
  E --> F[Lưu thay đổi]
  F --> G[Ghi audit log]
```

## WF12 và WF13: hủy, hoàn tiền và tích điểm

```mermaid
flowchart TD
  A[Khách gửi yêu cầu hủy] --> B{Đã thanh toán?}
  B -->|Chưa| C[Hủy ngay và giải phóng slot]
  B -->|Rồi| D[Chủ sân xét duyệt]
  D -->|Từ chối| E[Giữ booking]
  D -->|Duyệt| F[Hủy booking và chờ hoàn]
  F --> G[Ghi nhận đã hoàn tiền]
  H[Booking hoàn tất] --> I[Cộng điểm một lần]
```

Workflow HLV đặt định kỳ được hỗ trợ ở mô hình `booking_series`, `bookings` và `coach_schedules`. Bản demo chưa mở form tạo chuỗi để tránh làm luồng đặt sân cơ bản quá phức tạp.
