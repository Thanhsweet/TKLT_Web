# ERD MySQL của N01SPORT

Schema gồm 32 bảng, chia thành ba phân hệ để sơ đồ dễ đọc.

## Tài khoản và danh mục sân

```mermaid
erDiagram
  USERS ||--o{ AUTH_SESSIONS : owns
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ AUDIT_LOGS : performs
  USERS ||--o{ VENUES : owns
  VENUES ||--o{ COURTS : contains
  SPORTS ||--o{ COURTS : classifies
  VENUES ||--o{ VENUE_IMAGES : displays
  VENUES ||--o{ VENUE_AMENITIES : offers
  AMENITIES ||--o{ VENUE_AMENITIES : maps
  COURTS ||--o{ PRICE_RULES : prices
  USERS ||--o{ STAFF_ASSIGNMENTS : receives
  VENUES ||--o{ STAFF_ASSIGNMENTS : schedules
```

## Booking, thanh toán và quyền lợi

```mermaid
erDiagram
  USERS o|--o{ BOOKINGS : reserves
  COURTS ||--o{ BOOKINGS : reserves
  BOOKING_SERIES ||--o{ BOOKINGS : groups
  USERS ||--o{ BOOKING_SERIES : coaches
  PROMOTIONS ||--o{ BOOKINGS : discounts
  BOOKINGS ||--o{ PAYMENTS : pays
  BOOKINGS ||--o| REFUND_REQUESTS : requests
  VENUES ||--o{ SERVICES : sells
  BOOKINGS ||--o{ BOOKING_SERVICES : adds
  SERVICES ||--o{ BOOKING_SERVICES : selected
  BOOKING_SERVICES ||--o| EQUIPMENT_RENTALS : tracks
  PROMOTIONS ||--o{ PROMOTION_USES : records
  BOOKINGS ||--o| REVIEWS : receives
  USERS ||--o{ FAVORITES : saves
  VENUES ||--o{ FAVORITES : saved
  USERS ||--o{ LOYALTY_TRANSACTIONS : earns
  BOOKINGS ||--o{ LOYALTY_TRANSACTIONS : awards
```

## Vận hành sân

```mermaid
erDiagram
  COURTS ||--o{ MAINTENANCE_REQUESTS : reports
  USERS ||--o{ MAINTENANCE_REQUESTS : handles
  MAINTENANCE_REQUESTS ||--o{ MAINTENANCE_BLOCKS : creates
  COURTS ||--o{ MAINTENANCE_BLOCKS : blocks
  COURTS ||--o{ CLEANING_TASKS : requires
  BOOKINGS ||--o| CLEANING_TASKS : triggers
  USERS ||--o{ CLEANING_TASKS : performs
  USERS ||--o{ COACH_SCHEDULES : teaches
  BOOKINGS ||--o| COACH_SCHEDULES : reserves
  USERS ||--o{ BACKUP_JOBS : requests
```

## Danh sách bảng

| Nhóm | Bảng |
|---|---|
| Tài khoản | `users`, `auth_sessions`, `password_reset_tokens`, `notifications`, `audit_logs` |
| Sân | `sports`, `venues`, `venue_images`, `amenities`, `venue_amenities`, `courts`, `price_rules` |
| Kinh doanh | `promotions`, `booking_series`, `bookings`, `payments`, `refund_requests`, `services`, `booking_services`, `equipment_rentals`, `promotion_uses` |
| Khách hàng | `reviews`, `favorites`, `loyalty_rules`, `loyalty_transactions`, `coach_schedules` |
| Vận hành | `staff_assignments`, `maintenance_requests`, `maintenance_blocks`, `cleaning_tasks` |
| Hệ thống | `site_settings`, `backup_jobs` |

Tất cả bảng dùng InnoDB, `utf8mb4`, khóa ngoại có quy tắc xóa rõ ràng và chỉ mục theo truy vấn thường dùng.

Booking đặt tại quầy có `user_id = NULL`, lưu tên và số điện thoại ở `guest_name`, `guest_phone`. Người lễ tân thao tác được ghi ở `audit_logs.actor_id`; đơn được xác nhận ngay và trạng thái thu tiền được lưu riêng trong `payments`.
