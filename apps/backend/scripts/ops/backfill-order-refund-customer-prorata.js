/**
 * Cập nhật cột orders.order_list.refund (theo giá bán prorata, giống calcRemainingRefund)
 * cho đơn Chưa Hoàn / Đã Hoàn — sửa dữ liệu cũ ghi theo vốn NCC (~108k) thành đúng phần hoàn khách (~244k).
 *
 * Chạy: node backend/scripts/ops/backfill-order-refund-customer-prorata.js
 * Thử (không ghi DB): ... --dry-run
 */

const { db } = require("../../src/db");
const { TABLES, STATUS } = require("../../src/controllers/Order/constants");
const { normalizeOrderRow } = require("../../src/controllers/Order/helpers");
const { calcRemainingRefund } = require("../../src/controllers/Order/finance/refunds");
const { todayYMDInVietnam } = require("../../src/utils/normalizers");
const { isGiftOrder } = require("../../src/utils/orderHelpers");
const { ORDERS_SCHEMA } = require("../../src/config/dbSchema");

const refundCol = ORDERS_SCHEMA.ORDER_LIST.COLS.REFUND;
const statusCol = ORDERS_SCHEMA.ORDER_LIST.COLS.STATUS;

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const rows = await db(TABLES.orderList)
    .whereIn(statusCol, [STATUS.PENDING_REFUND, STATUS.REFUNDED])
    .select("*");

  const today = todayYMDInVietnam();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (isGiftOrder(row)) {
      skipped++;
      continue;
    }
    const normalized = normalizeOrderRow(row, today);
    if (
      normalized.so_ngay_con_lai === null ||
      normalized.so_ngay_con_lai === undefined
    ) {
      skipped++;
      continue;
    }

    const next = Math.max(0, Math.round(Number(calcRemainingRefund(row, normalized)) || 0));
    const cur = Math.abs(Number(row[refundCol] ?? row.refund ?? 0)) || 0;
    if (next === cur) {
      continue;
    }

    console.log(
      `${String(row.id_order || row.id || "?")}: refund ${cur} -> ${next}${dryRun ? " (dry-run)" : ""}`
    );
    if (!dryRun) {
      await db(TABLES.orderList)
        .where({ id: row.id })
        .update({ [refundCol]: next });
    }
    updated++;
  }

  console.log(
    `[backfill-refund] ${dryRun ? "Would update" : "Updated"} ${updated} row(s); skipped ${skipped} (gift or no remaining days). Total candidates: ${rows.length}.`
  );

  await db.destroy().catch(() => {});
}

main().catch((err) => {
  console.error("[backfill-refund]", err);
  process.exitCode = 1;
});
