import "dotenv/config";
import pool from "../database/mysql.js";
import { workOnce } from "../lib/operations.js";
const run = () =>
  workOnce().catch((e) => console.error("Worker:", e.code || e.message));
// Deploy exactly one worker. Recover jobs interrupted by process restart.
await pool.execute(
  "UPDATE backup_jobs SET status='queued' WHERE status='running'",
);
await pool.execute(
  "UPDATE email_outbox SET status='queued' WHERE status='sending'",
);
await run();
const timer = setInterval(run, 15000);
const close = async () => {
  clearInterval(timer);
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
