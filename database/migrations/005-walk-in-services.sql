-- Walk-in guests are identified by the linked booking, without a user account.
ALTER TABLE service_orders MODIFY COLUMN user_id BIGINT UNSIGNED NULL;
