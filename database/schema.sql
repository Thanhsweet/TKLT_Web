SET NAMES utf8mb4;
SET time_zone = '+07:00';

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','coach','owner','receptionist','technician','cleaner','admin') NOT NULL DEFAULT 'customer',
  status ENUM('active','locked','pending') NOT NULL DEFAULT 'active',
  loyalty_points INT UNSIGNED NOT NULL DEFAULT 0,
  avatar_url VARCHAR(500),
  last_login_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id), INDEX idx_sessions_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reset_user_expiry (user_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  reference_type VARCHAR(50),
  reference_id BIGINT UNSIGNED,
  read_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_read (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT UNSIGNED,
  old_values JSON,
  new_values JSON,
  ip_address VARCHAR(45),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_entity (entity_type, entity_id), INDEX idx_audit_actor_created (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL UNIQUE,
  icon_name VARCHAR(50) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS venues (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  address VARCHAR(255) NOT NULL,
  district VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,7), longitude DECIMAL(10,7),
  open_time TIME NOT NULL DEFAULT '05:00:00', close_time TIME NOT NULL DEFAULT '23:00:00',
  rating DECIMAL(2,1) UNSIGNED NOT NULL DEFAULT 0,
  review_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','pending','suspended') NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_venues_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_venues_hours CHECK (open_time < close_time),
  CONSTRAINT chk_venues_rating CHECK (rating BETWEEN 0 AND 5),
  INDEX idx_venues_owner_status (owner_id, status), INDEX idx_venues_location_status (city, district, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS venue_images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  alt_text VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_venue_images_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  INDEX idx_venue_images_order (venue_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS amenities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS venue_amenities (
  venue_id BIGINT UNSIGNED NOT NULL,
  amenity_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (venue_id, amenity_id),
  CONSTRAINT fk_va_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  CONSTRAINT fk_va_amenity FOREIGN KEY (amenity_id) REFERENCES amenities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT UNSIGNED NOT NULL,
  sport_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  surface VARCHAR(100) NOT NULL,
  capacity SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  indoor BOOLEAN NOT NULL DEFAULT FALSE,
  base_price INT UNSIGNED NOT NULL,
  slot_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  status ENUM('active','maintenance','inactive') NOT NULL DEFAULT 'active',
  current_state ENUM('ready','in_use','needs_cleaning','cleaning','maintenance') NOT NULL DEFAULT 'ready',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_courts_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  CONSTRAINT fk_courts_sport FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE RESTRICT,
  CONSTRAINT chk_courts_capacity CHECK (capacity > 0),
  CONSTRAINT chk_courts_slot CHECK (slot_minutes IN (30,60,90,120)),
  UNIQUE KEY uq_courts_venue_name (venue_id, name),
  INDEX idx_courts_sport_status (sport_id, status), INDEX idx_courts_venue_status (venue_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  court_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  day_of_week TINYINT UNSIGNED,
  start_time TIME NOT NULL, end_time TIME NOT NULL,
  price INT UNSIGNED NOT NULL,
  effective_from DATE, effective_to DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_price_court FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE,
  CONSTRAINT chk_price_day CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_price_time CHECK (start_time < end_time),
  INDEX idx_price_rules_lookup (court_id, active, day_of_week, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  discount_type ENUM('percent','fixed') NOT NULL,
  discount_value INT UNSIGNED NOT NULL,
  min_order_value INT UNSIGNED NOT NULL DEFAULT 0,
  max_discount INT UNSIGNED,
  usage_limit INT UNSIGNED,
  per_user_limit SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  starts_at DATETIME(3) NOT NULL, ends_at DATETIME(3) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_promotions_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_promotions_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  CONSTRAINT chk_promotions_dates CHECK (starts_at < ends_at),
  INDEX idx_promotions_lookup (code, active, starts_at, ends_at), INDEX idx_promotions_owner (owner_id, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_series (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  series_code VARCHAR(40) NOT NULL UNIQUE,
  coach_id BIGINT UNSIGNED NOT NULL,
  repeat_rule JSON NOT NULL,
  total_amount INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','confirmed','cancelled','completed') NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_series_coach FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_series_coach_status (coach_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_code VARCHAR(40) NOT NULL UNIQUE,
  series_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED NOT NULL,
  court_id BIGINT UNSIGNED NOT NULL,
  promotion_id BIGINT UNSIGNED,
  start_at DATETIME(3) NOT NULL, end_at DATETIME(3) NOT NULL,
  hold_expires_at DATETIME(3),
  subtotal INT UNSIGNED NOT NULL,
  service_amount INT UNSIGNED NOT NULL DEFAULT 0,
  discount_amount INT UNSIGNED NOT NULL DEFAULT 0,
  total_amount INT UNSIGNED NOT NULL,
  status ENUM('pending','confirmed','checked_in','completed','cancel_requested','cancelled','expired','no_show') NOT NULL DEFAULT 'pending',
  note VARCHAR(500),
  check_in_at DATETIME(3), completed_at DATETIME(3), cancelled_reason VARCHAR(500),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_bookings_series FOREIGN KEY (series_id) REFERENCES booking_series(id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_court FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL,
  CONSTRAINT chk_bookings_time CHECK (start_at < end_at),
  CONSTRAINT chk_bookings_amount CHECK (discount_amount <= subtotal + service_amount AND total_amount = subtotal + service_amount - discount_amount),
  INDEX idx_bookings_court_time (court_id, start_at, end_at, status),
  INDEX idx_bookings_user_created (user_id, created_at), INDEX idx_bookings_status_start (status, start_at),
  INDEX idx_bookings_hold (status, hold_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('cash','momo','vnpay','bank_transfer','demo') NOT NULL,
  transaction_ref VARCHAR(120) UNIQUE,
  qr_content VARCHAR(500),
  amount INT UNSIGNED NOT NULL,
  status ENUM('pending','paid','reconciling','failed','refund_pending','refunded') NOT NULL DEFAULT 'pending',
  paid_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
  INDEX idx_payments_booking_status (booking_id, status), INDEX idx_payments_provider_ref (provider, transaction_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refund_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL UNIQUE,
  requested_by BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED,
  reason VARCHAR(500) NOT NULL,
  requested_amount INT UNSIGNED NOT NULL DEFAULT 0,
  approved_amount INT UNSIGNED,
  status ENUM('pending','approved','rejected','refunded') NOT NULL DEFAULT 'pending',
  review_note VARCHAR(500),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), reviewed_at DATETIME(3),
  CONSTRAINT fk_refund_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refund_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refund_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_refund_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS services (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  type ENUM('sale','rental','technical') NOT NULL DEFAULT 'sale',
  unit VARCHAR(40) NOT NULL,
  price INT UNSIGNED NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_services_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  UNIQUE KEY uq_services_venue_name (venue_id, name), INDEX idx_services_venue_active (venue_id, active, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_services (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price INT UNSIGNED NOT NULL,
  status ENUM('requested','delivered','returned','cancelled') NOT NULL DEFAULT 'requested',
  added_by BIGINT UNSIGNED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_bs_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_bs_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bs_staff FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_booking_service (booking_id, service_id), INDEX idx_bs_status (booking_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipment_rentals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_service_id BIGINT UNSIGNED NOT NULL UNIQUE,
  handed_over_at DATETIME(3), returned_at DATETIME(3),
  condition_out VARCHAR(255), condition_in VARCHAR(255), damage_fee INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_rental_bs FOREIGN KEY (booking_service_id) REFERENCES booking_services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotion_uses (
  promotion_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (promotion_id, booking_id),
  CONSTRAINT fk_pu_promotion FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pu_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_pu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_pu_user (user_id, promotion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT,
  status ENUM('visible','hidden','pending') NOT NULL DEFAULT 'visible',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reviews_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5), INDEX idx_reviews_venue_status (venue_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorites (
  user_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, venue_id),
  CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_favorites_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  position ENUM('receptionist','technician','cleaner') NOT NULL,
  shift_start DATETIME(3) NOT NULL, shift_end DATETIME(3) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  role_note VARCHAR(255),
  CONSTRAINT fk_staff_user FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  CONSTRAINT chk_staff_shift CHECK (shift_start < shift_end),
  UNIQUE KEY uq_staff_shift (staff_id, venue_id, shift_start), INDEX idx_staff_venue_active (venue_id, active, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  court_id BIGINT UNSIGNED NOT NULL,
  reported_by BIGINT UNSIGNED NOT NULL,
  assigned_to BIGINT UNSIGNED,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status ENUM('open','assigned','in_progress','waiting_approval','resolved','closed','rejected') NOT NULL DEFAULT 'open',
  proposed_start DATETIME(3), proposed_end DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), resolved_at DATETIME(3),
  CONSTRAINT fk_maintenance_court FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE,
  CONSTRAINT fk_maintenance_reporter FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_maintenance_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_maintenance_status (status, priority, created_at), INDEX idx_maintenance_assignee (assigned_to, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance_blocks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  court_id BIGINT UNSIGNED NOT NULL,
  request_id BIGINT UNSIGNED,
  start_at DATETIME(3) NOT NULL, end_at DATETIME(3) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_blocks_court FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_request FOREIGN KEY (request_id) REFERENCES maintenance_requests(id) ON DELETE SET NULL,
  CONSTRAINT fk_blocks_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_blocks_time CHECK (start_at < end_at), INDEX idx_blocks_court_time (court_id, active, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  court_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED,
  assigned_to BIGINT UNSIGNED,
  scheduled_at DATETIME(3) NOT NULL,
  started_at DATETIME(3), completed_at DATETIME(3),
  status ENUM('pending','assigned','in_progress','completed','blocked') NOT NULL DEFAULT 'pending',
  issue_note VARCHAR(500),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_cleaning_court FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cleaning_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  CONSTRAINT fk_cleaning_staff FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_cleaning_staff_status (assigned_to, status, scheduled_at), INDEX idx_cleaning_court_status (court_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coach_schedules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coach_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NOT NULL UNIQUE,
  class_name VARCHAR(150) NOT NULL,
  participant_limit SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  note VARCHAR(500),
  status ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  CONSTRAINT fk_coach_schedule_user FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_coach_schedule_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  INDEX idx_coach_schedule (coach_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  points_per_amount INT UNSIGNED NOT NULL DEFAULT 10000,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_loyalty_rule_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_loyalty_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED,
  points INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_loyalty_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_loyalty_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  UNIQUE KEY uq_loyalty_booking_reason (booking_id, reason), INDEX idx_loyalty_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value JSON NOT NULL,
  description VARCHAR(255),
  updated_by BIGINT UNSIGNED,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_settings_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requested_by BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255),
  status ENUM('queued','running','completed','failed','restored') NOT NULL DEFAULT 'queued',
  checksum_sha256 CHAR(64),
  error_message TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3),
  CONSTRAINT fk_backup_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_backup_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
