import "dotenv/config";
import pool from "../database/mysql.js";
import { hashPassword } from "../lib/security.js";
const {
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD: password,
  ADMIN_NAME: name,
} = process.env;
if (!/^\S+@\S+\.\S+$/.test(email || "") || String(password || "").length < 12)
  throw new Error(
    "Đặt ADMIN_EMAIL, ADMIN_PASSWORD (>=12 ký tự), ADMIN_NAME trước khi chạy.",
  );
try {
  await pool.execute(
    "INSERT INTO users(full_name,email,password_hash,role,status) VALUES(?,?,?,'admin','active')",
    [name || "Quản trị N01", email.toLowerCase(), hashPassword(password)],
  );
  console.log(
    "Đã tạo quản trị viên. Xóa ADMIN_PASSWORD khỏi môi trường sau khi tạo.",
  );
} finally {
  await pool.end();
}
