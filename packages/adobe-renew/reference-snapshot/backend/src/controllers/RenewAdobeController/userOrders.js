const { db } = require("../../db");
const logger = require("../../utils/logger");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");
const {
  TBL_ORDER,
  ORD_COLS,
  ALLOWED_ORDER_STATUSES,
  getRenewAdobeVariantIds,
} = require("./orderAccess");

const TRACK_TABLE = "system_automation.order_user_tracking";
const MAP_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const MAP_COLS = RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.COLS;
const ACC_TABLE = tableName(RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE, SCHEMA_RENEW_ADOBE);
const ACC_COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

const listUserOrders = async (_req, res) => {
  try {
    const variantIds = await getRenewAdobeVariantIds();

    if (variantIds.length === 0) {
      logger.info(
        "[renew-adobe] user-orders: 0 rows (chưa có variant nào thuộc renew_adobe)"
      );
      return res.json([]);
    }

    const rows = await db({ o: TBL_ORDER })
      .leftJoin({ t: TRACK_TABLE }, function joinTracking() {
        this.on(
          db.raw("CAST(?? AS TEXT)", [`o.${ORD_COLS.ID_ORDER}`]),
          "=",
          "t.order_id"
        );
      })
      .leftJoin({ m: MAP_TABLE }, function joinMap() {
        this.on(`o.${ORD_COLS.ID_ORDER}`, "=", `m.${MAP_COLS.ORDER_ID}`).andOn(
          db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`o.${ORD_COLS.INFORMATION_ORDER}`]),
          "=",
          db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`m.${MAP_COLS.USER_EMAIL}`])
        );
      })
      .leftJoin({ acc: ACC_TABLE }, `acc.${ACC_COLS.ID}`, `m.${MAP_COLS.ADOBE_ACCOUNT_ID}`)
      .select(
        `o.${ORD_COLS.ID_ORDER} as order_code`,
        `o.${ORD_COLS.INFORMATION_ORDER} as information_order`,
        `o.${ORD_COLS.CUSTOMER} as customer`,
        `o.${ORD_COLS.CONTACT} as contact`,
        db.raw(
          `TO_CHAR((o.${ORD_COLS.EXPIRY_DATE})::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as expiry_date`
        ),
        `o.${ORD_COLS.STATUS} as status`,
        `t.org_name as tracking_org_name`,
        `t.status as tracking_status`,
        `t.id_product as tracking_id_product`,
        `m.${MAP_COLS.ADOBE_ACCOUNT_ID} as adobe_account_id`,
        `acc.${ACC_COLS.LICENSE_STATUS} as admin_license_status`,
        `acc.${ACC_COLS.ORG_NAME} as admin_org_name`
      )
      .whereIn(`o.${ORD_COLS.ID_PRODUCT}`, variantIds)
      .whereIn(`o.${ORD_COLS.STATUS}`, ALLOWED_ORDER_STATUSES)
      .whereNotNull(`o.${ORD_COLS.INFORMATION_ORDER}`)
      .orderBy(`o.${ORD_COLS.ID_ORDER}`, "asc");

    logger.info(
      "[renew-adobe] user-orders: %d rows (variant_ids: %s)",
      rows.length,
      variantIds.join(", ")
    );
    return res.json(rows);
  } catch (error) {
    logger.error("[renew-adobe] user-orders failed", {
      error: error.message,
    });
    return res
      .status(500)
      .json({ error: "Không thể tải danh sách user-orders." });
  }
};

module.exports = {
  listUserOrders,
};
