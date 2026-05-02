require("dotenv").config();
const { Pool } = require("pg");

const marker = process.argv[2];
if (!marker) {
  console.error("Usage: node verify-cleanup-marker.js <marker>");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const r1 = await pool.query(
    "SELECT COUNT(*)::int AS c FROM receipt.payment_receipt WHERE note ILIKE $1",
    [`%${marker}%`]
  );
  const r2 = await pool.query(
    "SELECT COUNT(*)::int AS c FROM orders.order_list WHERE note ILIKE $1 OR customer ILIKE $1",
    [`%${marker}%`]
  );
  const r3 = await pool.query(
    "SELECT COUNT(*)::int AS c FROM dashboard.dashboard_monthly_summary WHERE month_key = $1",
    ["2099-12"]
  );
  console.log(
    JSON.stringify({
      marker,
      receipt_rows: r1.rows[0].c,
      order_rows: r2.rows[0].c,
      summary_rows: r3.rows[0].c,
    })
  );
  await pool.end();
})().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
