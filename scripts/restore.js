import "dotenv/config";
import { spawn } from "node:child_process";
import { createReadStream, statSync } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import mysql from "mysql2/promise";
const args = process.argv.slice(2),
  file = args[0],
  target = args[1];
if (
  !file ||
  !target ||
  !args.includes("--confirm") ||
  !/^[a-zA-Z0-9_]+$/.test(target) ||
  target === (process.env.DB_NAME || "n01sport")
)
  throw new Error(
    "Dùng: npm run db:restore -- backup.sql n01sport_recovery --confirm. Phải phục hồi vào database MỚI.",
  );
if (!statSync(resolve(file)).isFile())
  throw new Error("Chọn file SQL sao lưu có thật.");
const c = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
try {
  await c.query(
    `CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
} finally {
  await c.end();
}
const child = spawn(
  process.env.MYSQL_BIN || "mysql",
  [
    "--host=" + process.env.DB_HOST,
    "--port=" + String(process.env.DB_PORT || 3306),
    "--user=" + process.env.DB_USER,
    target,
  ],
  {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    stdio: ["pipe", "inherit", "inherit"],
  },
);
const done = new Promise((r, j) => {
  child.on("error", j);
  child.on("exit", (code) =>
    code === 0 ? r() : j(new Error("Phục hồi thất bại.")),
  );
});
await Promise.all([
  pipeline(createReadStream(resolve(file)), child.stdin),
  done,
]);
console.log(
  "Đã phục hồi vào",
  target,
  "Kiểm tra trước khi đổi DB_NAME; dữ liệu đang chạy không bị ghi đè.",
);
