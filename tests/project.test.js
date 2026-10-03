import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, tokenHash, bookingCode } from '../lib/security.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('mật khẩu được băm và kiểm tra bằng scrypt', () => {
  const stored = hashPassword('Khach@123');
  assert.notEqual(stored, 'Khach@123');
  assert.equal(verifyPassword('Khach@123', stored), true);
  assert.equal(verifyPassword('SaiMatKhau', stored), false);
  assert.equal(tokenHash('token-demo').length, 64);
  assert.match(bookingCode(), /^N01-\d{6}-[A-F0-9]{6}$/);
});

test('schema là MySQL/InnoDB và bao phủ các phân hệ chính', () => {
  const schema = read('database/schema.sql');
  const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map((match) => match[1]);
  assert.ok(tables.length >= 30, `Chỉ tìm thấy ${tables.length} bảng`);
  for (const required of ['users','venues','courts','bookings','payments','refund_requests','staff_assignments','maintenance_requests','maintenance_blocks','cleaning_tasks','audit_logs']) {
    assert.ok(tables.includes(required), `Thiếu bảng ${required}`);
  }
  assert.match(schema, /ENGINE=InnoDB/g);
  assert.doesNotMatch(schema, /PRAGMA|AUTOINCREMENT|datetime\('now'\)/i);
});

test('backend dùng pool MySQL, transaction và khóa chống trùng lịch', () => {
  const server = read('server.js');
  assert.match(server, /mysql\.js/);
  assert.match(server, /beginTransaction\(\)/);
  assert.match(server, /FOR UPDATE/);
  assert.match(server, /maintenance_blocks/);
  assert.match(server, /hold_expires_at/);
});

test('giao diện có đăng ký và khu vực làm việc theo vai trò', () => {
  const html = read('public/index.html');
  const session = read('public/js/session.js');
  const courts = read('public/js/courts.js');
  assert.match(html, /register-dialog/);
  assert.match(html, /management-tabs/);
  assert.match(session, /receptionist/);
  assert.match(session, /technician/);
  assert.match(session, /cleaner/);
  assert.match(courts, /toggleFavorite/);
});
