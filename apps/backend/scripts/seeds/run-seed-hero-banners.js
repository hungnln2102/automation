/**
 * Chèn 4 slide hero mặc định (seed_hero_banners_website_defaults.sql).
 * Chỉ thêm khi content.banners đang trống — an toàn chạy lại.
 *
 * Chạy: npm run seed:hero-banners
 */
const path = require("path");
const fs = require("fs");
const { Client } = require("pg");
const { loadBackendEnv } = require("../../src/config/loadEnv");

loadBackendEnv();

const sqlPath = path.join(
  __dirname,
  "..",
  "..",
  "database",
  "seeds",
  "seed_hero_banners_website_defaults.sql"
);

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("Thiếu DATABASE_URL trong backend/.env");
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    const { rows } = await client.query(
      "SELECT COUNT(*)::int AS n FROM content.banners"
    );
    console.log(
      `Seed hero banners xong. Hiện có ${rows[0].n} dòng trong content.banners.`
    );
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("Lỗi seed hero banners:", err.message);
  process.exit(1);
});
