import mysql from "mysql2/promise";
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const db = process.env.DB_NAME || "n01sport";
if (!/^[A-Za-z0-9_]+$/.test(db)) throw new Error("DB_NAME không hợp lệ.");
const c = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "n01sport_user",
  password: process.env.DB_PASSWORD,
  database: db,
  multipleStatements: true,
});
try {
  await c.query(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  await c.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
  );
  const dir = fileURLToPath(new URL("./migrations/", import.meta.url));
  for (const file of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const [r] = await c.execute(
      "SELECT version FROM schema_migrations WHERE version=?",
      [file],
    );
    if (r.length) continue;
    await c.query(readFileSync(join(dir, file), "utf8"));
    await c.execute("INSERT INTO schema_migrations(version) VALUES(?)", [file]);
    console.log("Applied", file);
  }
} finally {
  await c.end();
}
