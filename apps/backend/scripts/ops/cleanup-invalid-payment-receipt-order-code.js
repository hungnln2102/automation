require("dotenv").config();
const { Pool } = require("pg");

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const preview = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM receipt.payment_receipt
      WHERE COALESCE(BTRIM(id_order), '') != ''
        AND BTRIM(id_order) !~* '^MAV[A-Z0-9]{3,20}$'
    `);

    const updated = await pool.query(`
      UPDATE receipt.payment_receipt
      SET id_order = ''
      WHERE COALESCE(BTRIM(id_order), '') != ''
        AND BTRIM(id_order) !~* '^MAV[A-Z0-9]{3,20}$'
      RETURNING id
    `);

    console.log(
      JSON.stringify({
        to_clean: preview.rows[0]?.cnt ?? 0,
        cleaned: updated.rowCount ?? 0,
      })
    );
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
