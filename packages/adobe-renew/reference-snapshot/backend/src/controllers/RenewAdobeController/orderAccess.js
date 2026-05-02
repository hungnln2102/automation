const { db } = require("../../db");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  SCHEMA_ORDERS,
  ORDERS_SCHEMA,
  tableName,
} = require("../../config/dbSchema");

const PS_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.PRODUCT_SYSTEM.TABLE,
  SCHEMA_RENEW_ADOBE
);
const PS_COLS = RENEW_ADOBE_SCHEMA.PRODUCT_SYSTEM.COLS;

const TBL_ORDER = tableName(ORDERS_SCHEMA.ORDER_LIST.TABLE, SCHEMA_ORDERS);
const ORD_COLS = ORDERS_SCHEMA.ORDER_LIST.COLS;

const RENEW_ADOBE_SYSTEM_CODE = "renew_adobe";
const ALLOWED_ORDER_STATUSES = ["Đã Thanh Toán", "Cần Gia Hạn", "Đang Xử Lý"];

async function getRenewAdobeVariantIds() {
  const rows = await db(PS_TABLE)
    .where(PS_COLS.SYSTEM_CODE, RENEW_ADOBE_SYSTEM_CODE)
    .select(PS_COLS.VARIANT_ID);

  return rows
    .map((row) => row[PS_COLS.VARIANT_ID])
    .filter((id) => id != null);
}

module.exports = {
  TBL_ORDER,
  ORD_COLS,
  ALLOWED_ORDER_STATUSES,
  getRenewAdobeVariantIds,
};
