import mysql from "mysql2/promise";
import "dotenv/config";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "n01sport_user",
  password: process.env.DB_PASSWORD || "N01Sport@123",
  database: process.env.DB_NAME || "n01sport",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: "utf8mb4",
  timezone: "+07:00",
  dateStrings: true,
  decimalNumbers: true,
});
pool.pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+07:00'", (error) => {
    if (error) console.error("Timezone initialization failed");
  });
});

export async function pingDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

export default pool;
