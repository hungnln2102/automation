/**
 * Kiểm tra an toàn trước khi drop schema `key_active`: bảng còn lại, trigger orders.order_list.
 *
 *   node scripts/ops/verify-key-active-legacy-deps.js
 *
 * Exit 0 nếu không có schema hoặc có thể drop (0 bảng, 0 trigger key_active).
 * Exit 1 nếu còn ràng buộc.
 */
const { loadBackendEnv } = require("../../src/config/loadEnv");

loadBackendEnv();
const { Client } = require("pg");

const SQL = `
WITH ka_exists AS (
  SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'key_active') AS v
),
ka_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'key_active'
    AND table_type = 'BASE TABLE'
),
ka_triggers AS (
  SELECT t.tgname::text AS tgname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace tbl_ns ON tbl_ns.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace fn_ns ON fn_ns.oid = p.pronamespace
  WHERE tbl_ns.nspname = 'orders'
    AND c.relname = 'order_list'
    AND NOT t.tgisinternal
    AND fn_ns.nspname = 'key_active'
)
SELECT
  (SELECT v FROM ka_exists) AS key_active_schema_exists,
  COALESCE((SELECT json_agg(table_name ORDER BY table_name) FROM ka_tables), '[]'::json) AS tables_in_key_active,
  COALESCE((SELECT json_agg(tgname ORDER BY tgname) FROM ka_triggers), '[]'::json) AS order_list_triggers_on_key_active;
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(SQL);
    const row = rows[0] || {};
    console.log(JSON.stringify(row, null, 2));

    if (!row.key_active_schema_exists) {
      console.log("OK: schema key_active không còn (đã drop hoặc chưa từng có).");
      return;
    }

    const tables = row.tables_in_key_active || [];
    const trigs = row.order_list_triggers_on_key_active || [];
    if (Array.isArray(tables) && tables.length > 0) {
      console.error("BLOCKED: key_active vẫn có bảng.");
      process.exitCode = 1;
      return;
    }
    if (Array.isArray(trigs) && trigs.length > 0) {
      console.error("BLOCKED: orders.order_list vẫn có trigger dùng function key_active.");
      process.exitCode = 1;
      return;
    }
    console.log("OK: có thể chạy migration drop key_active (schema rỗng bảng, không trigger).");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
