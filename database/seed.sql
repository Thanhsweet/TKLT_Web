INSERT IGNORE INTO sports (id, slug, name, icon_name, status) VALUES
  (1, 'bong-da', 'Bóng đá', 'football', 'active'),
  (2, 'cau-long', 'Cầu lông', 'badminton', 'active'),
  (3, 'tennis', 'Tennis', 'tennis', 'active'),
  (4, 'bong-ro', 'Bóng rổ', 'basketball', 'active'),
  (5, 'pickleball', 'Pickleball', 'pickleball', 'active');

INSERT IGNORE INTO amenities (id, slug, name) VALUES
  (1, 'parking', 'Bãi đỗ xe'), (2, 'shower', 'Phòng tắm'),
  (3, 'lighting', 'Đèn thi đấu'), (4, 'drinks', 'Nước uống'),
  (5, 'equipment', 'Thuê dụng cụ'), (6, 'wifi', 'Wi-Fi miễn phí');

INSERT IGNORE INTO site_settings (setting_key, setting_value, description) VALUES
  ('booking_hold_minutes', JSON_OBJECT('value', 10), 'Số phút giữ chỗ chờ thanh toán'),
  ('support_hours', JSON_OBJECT('from', '06:00', 'to', '23:00'), 'Khung giờ hỗ trợ khách hàng'),
  ('cancellation_policy', JSON_OBJECT('mode', 'owner_review', 'refund', 'manual'), 'Chính sách hủy và hoàn tiền');
