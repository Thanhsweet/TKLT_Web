// Additive upgrade for existing installations; no reset or seed is required.
export async function ensureOfflineBookingSchema(connection) {
  const [columns] = await connection.execute(`SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'`);
  const existing = new Map(columns.map((column) => [column.COLUMN_NAME, column.IS_NULLABLE]));
  const changes = [];
  if (existing.get('user_id') === 'NO') changes.push('MODIFY COLUMN user_id BIGINT UNSIGNED NULL');
  if (!existing.has('guest_name')) changes.push('ADD COLUMN guest_name VARCHAR(150) NULL');
  if (!existing.has('guest_phone')) changes.push('ADD COLUMN guest_phone VARCHAR(20) NULL');
  if (changes.length) await connection.query(`ALTER TABLE bookings ${changes.join(', ')}`);
}
