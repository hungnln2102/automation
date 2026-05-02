require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const res = await pool.query(`
    SELECT column_name, is_nullable, column_default, data_type
    FROM information_schema.columns
    WHERE table_schema = 'orders' AND table_name = 'order_list'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  const seq = await pool.query(`
    SELECT
      pg_get_serial_sequence('orders.order_list','id') AS seq_name,
      (SELECT MAX(id) FROM orders.order_list) AS max_id
  `);
  console.log(JSON.stringify(seq.rows, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
