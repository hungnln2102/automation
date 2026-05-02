const { db } = require("../../src/db");
const { FINANCE_SCHEMA, SCHEMA_FINANCE, tableName } = require("../../src/config/dbSchema");
const {
  buildAlignedMonthlyRows,
} = require("../../src/controllers/DashboardController/monthlySnapshot");

const summaryTable = tableName(
  FINANCE_SCHEMA.DASHBOARD_MONTHLY_SUMMARY.TABLE,
  SCHEMA_FINANCE
);
const summaryCols = FINANCE_SCHEMA.DASHBOARD_MONTHLY_SUMMARY.COLS;

async function rebuildDashboardMonthlySummary() {
  const trx = await db.transaction();

  try {
    const rows = await buildAlignedMonthlyRows(trx, { revenueSource: "receipts" });
    const rowsToInsert = rows.map((row) => ({
      ...row,
      [summaryCols.UPDATED_AT]: trx.raw("now()"),
    }));

    await trx(summaryTable).del();

    if (rowsToInsert.length > 0) {
      await trx(summaryTable).insert(rowsToInsert);
    }

    await trx.commit();

    console.log(
      `[dashboard-summary] Rebuilt ${rows.length} month rows into ${summaryTable}`
    );
    if (rows.length > 0) {
      console.table(
        rows.map((row) => {
          const mk = String(row[summaryCols.MONTH_KEY] || "");
          return {
            month_key: mk,
            total_orders: Number(row[summaryCols.TOTAL_ORDERS]) || 0,
            canceled_orders: Number(row[summaryCols.CANCELED_ORDERS]) || 0,
            total_revenue: Number(row[summaryCols.TOTAL_REVENUE]) || 0,
            total_profit: Number(row[summaryCols.TOTAL_PROFIT]) || 0,
            total_refund: Number(row[summaryCols.TOTAL_REFUND]) || 0,
            total_import: Number(row[summaryCols.TOTAL_IMPORT]) || 0,
            total_tax: Number(row[summaryCols.TOTAL_TAX]) || 0,
          };
        })
      );
    }
  } catch (error) {
    await trx.rollback();
    console.error("[dashboard-summary] Rebuild failed:", error.message);
    throw error;
  } finally {
    await db.destroy().catch(() => {});
  }
}

if (require.main === module) {
  rebuildDashboardMonthlySummary().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  rebuildDashboardMonthlySummary,
};
