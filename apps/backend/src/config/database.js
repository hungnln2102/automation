const { Pool } = require("pg");
const { loadBackendEnv } = require("./loadEnv");

loadBackendEnv();

const isProd = process.env.NODE_ENV === "production";

const RAW_POOL_MAX = Number(process.env.DB_RAW_POOL_MAX) || 5;

const CONNECTION_TIMEOUT = Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 15_000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: RAW_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: CONNECTION_TIMEOUT,
});

const checkConnection = async (retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      const result = await client.query("SELECT NOW()");
      client.release();
      console.log(
        `✅ Kết nối Database thành công (raw pool max=${RAW_POOL_MAX}):`,
        result.rows[0].now
      );
      return;
    } catch (err) {
      console.error(`❌ Lỗi kết nối Database (lần ${attempt}/${retries}):`, err.message);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  if (isProd) process.exit(1);
};

checkConnection();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
