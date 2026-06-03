const knex = require("knex");
const { loadBackendEnv } = require("../config/loadEnv");
const { SCHEMA_ADMIN, SCHEMA_RENEW_ADOBE } = require("../config/dbSchema");

loadBackendEnv();

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.PG_URL ||
  "";

if (!DATABASE_URL) {
  try {
    const logger = require("../utils/logger");
    logger.warn("[db] Thiếu DATABASE_URL/POSTGRES_URL.");
  } catch {
    console.warn("[db] Thiếu DATABASE_URL/POSTGRES_URL.");
  }
}

const searchPath = Array.from(
  new Set([SCHEMA_ADMIN, SCHEMA_RENEW_ADOBE].filter(Boolean))
);
const KNEX_POOL_MAX = Number(process.env.DB_KNEX_POOL_MAX) || 10;
const shouldCheckKnexOnBoot =
  process.env.NODE_ENV !== "test" &&
  !["1", "true", "yes"].includes(
    String(process.env.DISABLE_DB_BOOT_CHECK || "").trim().toLowerCase()
  );

const db = knex({
  client: "pg",
  connection: DATABASE_URL,
  pool: {
    min: 0,
    max: KNEX_POOL_MAX,
    idleTimeoutMillis: 30_000,
  },
  searchPath,
});

const verifyKnexConnection = async () => {
  try {
    await db.raw("SELECT 1");
    console.log(`✅ Knex pool sẵn sàng (max=${KNEX_POOL_MAX})`);
  } catch (err) {
    console.error("❌ Knex kết nối thất bại:", err.message);
    if (process.env.NODE_ENV === "production") process.exit(1);
  }
};

if (shouldCheckKnexOnBoot) {
  verifyKnexConnection();
}

module.exports = db;
module.exports.verifyKnexConnection = verifyKnexConnection;
