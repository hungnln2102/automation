/**
 * Backfill partner.supplier_order_cost_log: toi da 5 don dang xu ly chua co log.
 * Chay tu thu muc backend:
 *   node scripts/ops/seed-supplier-order-cost-log-five.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { db } = require("../../src/db");
const {
  ORDERS_SCHEMA,
  PARTNER_SCHEMA,
  SCHEMA_ORDERS,
  SCHEMA_PARTNER,
  tableName,
} = require("../../src/config/dbSchema");
const { ORDER_PREFIXES } = require("../../src/utils/orderHelpers");
const { STATUS } = require("../../src/utils/statuses");

const PROCESSING = STATUS.PROCESSING;
const NCC_UNPAID = "Chưa Thanh Toán";
const mavnLike = `${String(ORDER_PREFIXES.import || "MAVN").toUpperCase()}%`;
const ORDER_TABLE = tableName(ORDERS_SCHEMA.ORDER_LIST.TABLE, SCHEMA_ORDERS);
const LOG_TABLE = tableName(
  PARTNER_SCHEMA.SUPPLIER_ORDER_COST_LOG.TABLE,
  SCHEMA_PARTNER
);
const O = ORDERS_SCHEMA.ORDER_LIST.COLS;
const L = PARTNER_SCHEMA.SUPPLIER_ORDER_COST_LOG.COLS;

async function main() {
  const sql = `
    INSERT INTO ${LOG_TABLE} (
      ${L.ORDER_LIST_ID},
      ${L.SUPPLY_ID},
      ${L.ID_ORDER},
      ${L.IMPORT_COST},
      ${L.REFUND_AMOUNT},
      ${L.NCC_PAYMENT_STATUS}
    )
    SELECT
      q.order_list_id,
      q.supply_id,
      q.id_order,
      q.import_cost,
      q.refund_amount,
      q.ncc_payment_status
    FROM (
      SELECT * FROM (
        SELECT
          o.${O.ID} AS order_list_id,
          o.${O.ID_SUPPLY} AS supply_id,
          COALESCE(NULLIF(TRIM(o.${O.ID_ORDER}::text), ''), '') AS id_order,
          COALESCE(o.${O.COST}, 0) AS import_cost,
          COALESCE(o.${O.REFUND}, 0) AS refund_amount,
          ? AS ncc_payment_status
        FROM ${ORDER_TABLE} o
        WHERE o.${O.STATUS} = ?
          AND o.${O.ID_SUPPLY} IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${LOG_TABLE} l
            WHERE l.${L.ORDER_LIST_ID} = o.${O.ID}
          )
          AND UPPER(TRIM(COALESCE(o.${O.ID_ORDER}::text, ''))) LIKE ?
        ORDER BY o.${O.ID} DESC
        LIMIT 2
      ) mavn
      UNION ALL
      SELECT * FROM (
        SELECT
          o.${O.ID} AS order_list_id,
          o.${O.ID_SUPPLY} AS supply_id,
          COALESCE(NULLIF(TRIM(o.${O.ID_ORDER}::text), ''), '') AS id_order,
          COALESCE(o.${O.COST}, 0) AS import_cost,
          COALESCE(o.${O.REFUND}, 0) AS refund_amount,
          ? AS ncc_payment_status
        FROM ${ORDER_TABLE} o
        WHERE o.${O.STATUS} = ?
          AND o.${O.ID_SUPPLY} IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${LOG_TABLE} l
            WHERE l.${L.ORDER_LIST_ID} = o.${O.ID}
          )
          AND UPPER(TRIM(COALESCE(o.${O.ID_ORDER}::text, ''))) NOT LIKE ?
        ORDER BY o.${O.ID} DESC
        LIMIT 3
      ) other
    ) q
    RETURNING order_list_id, id_order, supply_id, import_cost;
  `;

  const result = await db.raw(sql, [
    NCC_UNPAID,
    PROCESSING,
    mavnLike,
    NCC_UNPAID,
    PROCESSING,
    mavnLike,
  ]);
  const inserted = Array.isArray(result.rows) ? result.rows : [];

  console.log(`Da chen: ${inserted.length} dong.`);
  inserted.forEach((row) => {
    console.log(
      `  - order_list_id=${row.order_list_id} id_order=${row.id_order} supply_id=${row.supply_id} cost=${row.import_cost}`
    );
  });

  if (inserted.length === 0) {
    console.log(
      `Khong co don dang xu ly + co NCC nao chua co log. Kiem tra du lieu ${ORDER_TABLE}.`
    );
  }

  await db.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
