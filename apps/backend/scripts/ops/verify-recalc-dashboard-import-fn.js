/**
 * One-off verification: partner.fn_recalc_dashboard_total_import includes MAVN PAID margin rule.
 * Run: node scripts/ops/verify-recalc-dashboard-import-fn.js
 */
const { loadBackendEnv } = require("../../src/config/loadEnv");

loadBackendEnv();

const knex = require("knex")(require("../../knexfile").development);

async function main() {
  const { rows } = await knex.raw(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'partner' AND p.proname = 'fn_recalc_dashboard_total_import'
  `);
  if (!rows[0]) {
    throw new Error("Function partner.fn_recalc_dashboard_total_import not found");
  }
  const d = rows[0].def;
  const hasMavn =
    d.includes("MAVN") &&
    d.includes("Đã Thanh Toán") &&
    d.includes("COALESCE(ol.cost::numeric, 0)");
  const hasImportSum = d.includes("import_cost");
  console.log("has MAVN paid -cost margin:", hasMavn);
  console.log("references import_cost:", hasImportSum);
  if (!hasMavn || !hasImportSum) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => knex.destroy());
