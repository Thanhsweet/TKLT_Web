import mysql from 'mysql2/promise';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../lib/security.js';
import { ensureOfflineBookingSchema } from './migrations.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbName = process.env.DB_NAME || 'n01sport';
const reset = process.argv.includes('--reset');

if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error('DB_NAME chỉ được chứa chữ, số và dấu gạch dưới.');

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'n01sport_user',
  password: process.env.DB_PASSWORD ?? '',
  multipleStatements: true,
  charset: 'utf8mb4',
  timezone: '+07:00'
});

if (reset) await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await connection.query(`USE \`${dbName}\``);
await connection.query(readFileSync(resolve(root, 'database/schema.sql'), 'utf8'));
await ensureOfflineBookingSchema(connection);
await connection.query(readFileSync(resolve(root, 'database/seed.sql'), 'utf8'));

const users = [
  [1, 'Minh Anh', 'khach@n01sport.vn', '0901000001', 'Khach@123', 'customer', 240],
  [2, 'Trần Quốc Huy', 'chusan@n01sport.vn', '0901000002', 'ChuSan@123', 'owner', 0],
  [3, 'Nguyễn Thu Hà', 'letan@n01sport.vn', '0901000003', 'LeTan@123', 'receptionist', 0],
  [4, 'Quản trị N01', 'admin@n01sport.vn', '0901000004', 'Admin@123', 'admin', 0],
  [5, 'Lê Anh Khoa', 'kythuat@n01sport.vn', '0901000005', 'KyThuat@123', 'technician', 0],
  [6, 'Phạm Ngọc Mai', 'vesinh@n01sport.vn', '0901000006', 'VeSinh@123', 'cleaner', 0],
  [7, 'Võ Hoàng Nam', 'hlv@n01sport.vn', '0901000007', 'HLV@12345', 'coach', 120]
];

for (const [id, name, email, phone, password, role, points] of users) {
  await connection.execute(`
    INSERT INTO users (id, full_name, email, phone, password_hash, role, status, loyalty_points)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone), role = VALUES(role), status = 'active'
  `, [id, name, email, phone, hashPassword(password), role, points]);
}

const venues = [
  [1, 2, 'N01 Arena Hải Châu', 'n01-arena-hai-chau', 'Cụm sân đa năng tiêu chuẩn, thoáng mát và đầy đủ tiện ích.', '18 Nguyễn Văn Linh', 'Hải Châu', 'Đà Nẵng', 16.0605, 108.2208, '05:00:00', '23:00:00', 4.9, 128, 'active'],
  [2, 2, 'Green Field Sơn Trà', 'green-field-son-tra', 'Sân cỏ nhân tạo chất lượng cao, phù hợp thi đấu nhóm.', '82 Ngô Quyền', 'Sơn Trà', 'Đà Nẵng', 16.0718, 108.2302, '06:00:00', '23:00:00', 4.8, 96, 'active'],
  [3, 2, 'Match Point Thanh Khê', 'match-point-thanh-khe', 'Không gian thể thao trong nhà hiện đại, đặt lịch nhanh.', '126 Điện Biên Phủ', 'Thanh Khê', 'Đà Nẵng', 16.0663, 108.1993, '05:30:00', '22:30:00', 4.7, 74, 'active']
];
for (const row of venues) {
  await connection.execute(`INSERT INTO venues (id, owner_id, name, slug, description, address, district, city, latitude, longitude, open_time, close_time, rating, review_count, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), status = VALUES(status)`, row);
}

const courts = [
  [1,1,1,'Sân bóng A1','Cỏ nhân tạo FIFA',14,0,320000,60], [2,1,2,'Sân cầu lông B1','Thảm PVC',4,1,110000,60],
  [3,1,5,'Sân pickleball P1','Acrylic',4,1,150000,60], [4,2,1,'Sân bóng Green 1','Cỏ nhân tạo',14,0,280000,60],
  [5,2,3,'Sân tennis T1','Acrylic',4,0,240000,60], [6,3,2,'Sân cầu lông M1','Thảm thi đấu',4,1,130000,60],
  [7,3,4,'Sân bóng rổ R1','Gỗ maple',12,1,360000,60], [8,3,5,'Sân pickleball P2','Acrylic',4,1,160000,60]
];
for (const row of courts) {
  await connection.execute(`INSERT INTO courts (id, venue_id, sport_id, name, surface, capacity, indoor, base_price, slot_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE surface = VALUES(surface), base_price = VALUES(base_price)`, row);
}

for (const [venueId, amenityId] of [[1,1],[1,2],[1,3],[1,4],[1,5],[1,6],[2,1],[2,3],[2,4],[3,1],[3,2],[3,3],[3,5],[3,6]]) {
  await connection.execute('INSERT IGNORE INTO venue_amenities (venue_id, amenity_id) VALUES (?, ?)', [venueId, amenityId]);
}

const services = [
  [1,1,'Thuê bóng','rental','quả',30000,20], [2,1,'Nước điện giải','sale','chai',20000,80],
  [3,1,'Áo bib','rental','bộ',25000,12], [4,2,'Thuê vợt tennis','rental','chiếc',50000,10],
  [5,3,'Thuê vợt cầu lông','rental','chiếc',40000,16], [6,1,'Bơm bóng','technical','lần',15000,100]
];
for (const row of services) {
  await connection.execute(`INSERT INTO services (id, venue_id, name, type, unit, price, stock_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE type = VALUES(type), price = VALUES(price), stock_quantity = VALUES(stock_quantity)`, row);
}

for (let courtId = 1, ruleId = 1; courtId <= 8; courtId += 1) {
  const [[court]] = await connection.execute('SELECT base_price FROM courts WHERE id = ?', [courtId]);
  for (let day = 0; day <= 6; day += 1) {
    const price = Math.round(court.base_price * 1.2 / 10000) * 10000;
    await connection.execute(`INSERT INTO price_rules (id, court_id, name, day_of_week, start_time, end_time, price)
      VALUES (?, ?, 'Giờ vàng buổi tối', ?, '17:00:00', '21:00:00', ?) ON DUPLICATE KEY UPDATE price = VALUES(price), active = TRUE`, [ruleId++, courtId, day, price]);
  }
}

for (const row of [
  [1,2,null,'CHAOSAN','Ưu đãi lần đầu','percent',10,100000,50000,500,1,'2025-01-01 00:00:00','2030-12-31 23:59:59'],
  [2,2,null,'NHOMVUI','Đi đông càng vui','fixed',30000,250000,null,300,1,'2025-01-01 00:00:00','2030-12-31 23:59:59']
]) {
  await connection.execute(`INSERT INTO promotions (id, owner_id, venue_id, code, name, discount_type, discount_value, min_order_value, max_discount, usage_limit, per_user_limit, starts_at, ends_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), active = TRUE`, row);
}

await connection.execute(`INSERT INTO loyalty_rules (owner_id, points_per_amount, active) VALUES (2, 10000, TRUE)
  ON DUPLICATE KEY UPDATE points_per_amount = VALUES(points_per_amount), active = TRUE`);

const start = new Date(Date.now() - 60 * 60 * 1000);
const end = new Date(Date.now() + 7 * 60 * 60 * 1000);
for (const [id, staffId, position] of [[1,3,'receptionist'],[2,5,'technician'],[3,6,'cleaner']]) {
  await connection.execute(`INSERT INTO staff_assignments (id, staff_id, venue_id, position, shift_start, shift_end, role_note)
    VALUES (?, ?, 1, ?, ?, ?, 'Ca làm mẫu hôm nay') ON DUPLICATE KEY UPDATE active = TRUE`, [id, staffId, position, start, end]);
}

console.log(`MySQL database ready: ${dbName}`);
console.log('Demo: khach@n01sport.vn / Khach@123 | chusan@n01sport.vn / ChuSan@123 | letan@n01sport.vn / LeTan@123 | admin@n01sport.vn / Admin@123');
await connection.end();
