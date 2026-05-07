/**
 * Tạo database local nếu chưa có (đọc DATABASE_URL từ loadBackendEnv, kết nối DB `postgres`).
 * Chạy: node scripts/ops/ensure-local-database.js
 */
const { Client } = require("pg");
const { loadBackendEnv } = require("../../src/config/loadEnv");

loadBackendEnv();

function adminConnectionString(databaseUrl) {
  const u = new URL(databaseUrl);
  u.pathname = "/postgres";
  return u.toString();
}

async function main() {
  const baseUrl =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PG_URL;
  if (!baseUrl) {
    console.error("Thiếu DATABASE_URL (ví dụ trong .env + .env.local).");
    process.exit(1);
  }
  const adminUrl = adminConnectionString(baseUrl);
  const targetDb = new URL(baseUrl).pathname.replace(/^\//, "") || "postgres";
  if (!targetDb || targetDb === "postgres") {
    console.error("DATABASE_URL phải chỉ tới database đích (không chỉ /postgres).");
    process.exit(1);
  }

  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    const r = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      targetDb,
    ]);
    if (r.rowCount > 0) {
      console.log(`OK: database "${targetDb}" đã tồn tại.`);
      return;
    }
    const safe = /^[a-zA-Z0-9_]+$/.test(targetDb);
    if (!safe) {
      console.error(`Tên database không hợp lệ: ${targetDb}`);
      process.exit(1);
    }
    await c.query(`CREATE DATABASE "${targetDb}"`);
    console.log(`OK: đã tạo database "${targetDb}". Chạy: npm run migrate`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
