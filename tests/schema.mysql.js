import "dotenv/config";
import mysql from "mysql2/promise";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { hashPassword } from "../lib/security.js";
const name = process.env.DB_NAME;
if (!name?.endsWith("_test") || !/^[A-Za-z0-9_]+$/.test(name))
  throw Error("Requires DB_NAME ending in _test.");
const c = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  multipleStatements: true,
});
const run = (script, db, extra = {}) =>
  execFileSync(process.execPath, [script], {
    env: { ...process.env, DB_NAME: db, NODE_ENV: "test", ...extra },
    stdio: "pipe",
  }).toString();
try {
  const upgrade = name + "_upgrade_test",
    fresh = name + "_install_test";
  for (const db of [upgrade, fresh])
    await c.query("DROP DATABASE IF EXISTS `" + db + "`");
  await c.query(
    "CREATE DATABASE `" +
      upgrade +
      "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
  await c.query("USE `" + upgrade + "`");
  await c.query(readFileSync("database/schema.sql", "utf8"));
  assert.equal((await c.query("SHOW TABLES"))[0].length, 32);
  await c.execute(
    "INSERT INTO users(id,full_name,email,password_hash,role) VALUES(9001,'Existing v2 user','keep@test.invalid',?,'customer')",
    [hashPassword("TestPreserve@123")],
  );
  run("database/migrate.js", upgrade);
  run("database/migrate.js", upgrade);
  assert.equal(
    (await c.query("SELECT full_name FROM users WHERE id=9001"))[0][0]
      .full_name,
    "Existing v2 user",
  );
  assert.equal((await c.query("SHOW TABLES"))[0].length, 44);
  assert.equal(
    (await c.query("SELECT COUNT(*) AS n FROM schema_migrations"))[0][0].n,
    2,
  );
  run("database/setup.js", fresh);
  await c.query("USE `" + fresh + "`");
  assert.equal((await c.query("SELECT COUNT(*) AS n FROM users"))[0][0].n, 0);
  run("scripts/create-admin.js", fresh, {
    ADMIN_EMAIL: "release@test.invalid",
    ADMIN_NAME: "Release Test",
    ADMIN_PASSWORD: "TestReleaseAdmin@12345",
  });
  assert.equal((await c.query("SELECT COUNT(*) AS n FROM users"))[0][0].n, 1);
  assert.equal(
    (
      await c.query("SELECT role FROM users WHERE email='release@test.invalid'")
    )[0][0].role,
    "admin",
  );
  assert.equal((await c.query("SHOW TABLES"))[0].length, 44);
  console.log(
    "MySQL schema: v2 32 tables → v3 44 tables; existing user retained; migrations repeat safely; clean install has no demo accounts and admin:create works.",
  );
} finally {
  await c.end();
}
