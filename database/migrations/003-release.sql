CREATE TABLE IF NOT EXISTS venue_payment_settings (
  venue_id BIGINT UNSIGNED PRIMARY KEY,
  bank_code VARCHAR(30) NOT NULL, account_number VARCHAR(40) NOT NULL, account_name VARCHAR(150) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS payment_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, provider VARCHAR(30) NOT NULL, event_id VARCHAR(100) NOT NULL,
  booking_id BIGINT UNSIGNED, amount INT UNSIGNED NOT NULL, payload JSON NOT NULL,
  status ENUM('processed','unmatched','review') NOT NULL DEFAULT 'unmatched', note VARCHAR(255),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_event(provider,event_id), FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS service_orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_code VARCHAR(40) NOT NULL UNIQUE,
  booking_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL, venue_id BIGINT UNSIGNED NOT NULL,
  amount INT UNSIGNED NOT NULL, damage_fee INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','paid','delivered','completed','cancelled') NOT NULL DEFAULT 'pending',
  payment_ref VARCHAR(120), paid_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY(booking_id) REFERENCES bookings(id), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(venue_id) REFERENCES venues(id),
  INDEX idx_orders_venue(venue_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS service_order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL, service_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL, unit_price INT UNSIGNED NOT NULL,
  returned_quantity INT UNSIGNED NOT NULL DEFAULT 0, lost_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('reserved','delivered','returned','cancelled') NOT NULL DEFAULT 'reserved',
  condition_out VARCHAR(255), condition_in VARCHAR(255), handed_over_at DATETIME(3), returned_at DATETIME(3),
  UNIQUE KEY uq_order_item(order_id,service_id), FOREIGN KEY(order_id) REFERENCES service_orders(id), FOREIGN KEY(service_id) REFERENCES services(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, venue_id BIGINT UNSIGNED,
  subject VARCHAR(200) NOT NULL, message TEXT NOT NULL,
  status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(venue_id) REFERENCES venues(id), INDEX idx_ticket_status(status,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS support_replies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ticket_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
  message TEXT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY(ticket_id) REFERENCES support_tickets(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS rewards (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, owner_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL, points_cost INT UNSIGNED NOT NULL, discount_value INT UNSIGNED NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE, FOREIGN KEY(owner_id) REFERENCES users(id), CHECK(points_cost>0 AND discount_value>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, reward_id BIGINT UNSIGNED NOT NULL,
  promotion_id BIGINT UNSIGNED NOT NULL UNIQUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(reward_id) REFERENCES rewards(id), FOREIGN KEY(promotion_id) REFERENCES promotions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL, body TEXT NOT NULL,
  status ENUM('queued','sending','sent','failed') NOT NULL DEFAULT 'queued', attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(255), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), sent_at DATETIME(3),
  INDEX idx_outbox_status(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO sports(id,slug,name,icon_name) VALUES
 (1,'bong-da','Bóng đá','football'),(2,'cau-long','Cầu lông','badminton'),(3,'tennis','Tennis','tennis'),(4,'bong-ro','Bóng rổ','basketball'),(5,'pickleball','Pickleball','pickleball');
