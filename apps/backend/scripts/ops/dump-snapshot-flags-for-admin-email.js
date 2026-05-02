/**
 * In ra user từ user_account_mapping + kết quả inferAdobeProProductIdSet / applyAdobeProFlags
 * (cột users_snapshot đã bỏ — nguồn đối chiếu là mapping + order_user_tracking).
 *
 * Usage (từ backend):
 *   node scripts/ops/dump-snapshot-flags-for-admin-email.js matthew.mack39211@graphiclean.site
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { db } = require("../../src/db");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../src/config/dbSchema");
const { TABLE, COLS } = require("../../src/controllers/RenewAdobeController/accountTable");
const { applyAdobeProFlags } = require("../../src/services/renew-adobe/adobe-renew-v2/shared/usersListApi");
const {
  inferAdobeProProductIdSet,
  parseCcpProductIdsFromAlertConfig,
} = require("../../src/services/renew-adobe/adobe-renew-v2/shared/accessChecks");

const MAP_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const MAP_COLS = RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.COLS;

async function main() {
  const target = (process.argv[2] || "").trim().toLowerCase();
  if (!target) {
    console.error("Thiếu email admin.");
    process.exit(1);
  }

  const row = await db(TABLE)
    .whereRaw(`LOWER(TRIM(${COLS.EMAIL})) = ?`, [target])
    .first();

  if (!row) {
    console.error("Không tìm thấy account:", target);
    process.exit(1);
  }

  const accountId = Number(row[COLS.ID]);
  const emails = await db(MAP_TABLE)
    .where(MAP_COLS.ADOBE_ACCOUNT_ID, accountId)
    .pluck(MAP_COLS.USER_EMAIL);

  const admin = String(row[COLS.EMAIL] || "").trim().toLowerCase();
  const asApiUsers = emails.map((email) => ({
    id: null,
    name: "",
    email: String(email || "").trim(),
    products: [],
    accountStatus: null,
    product: false,
    hasProduct: false,
  }));

  const pinnedFromDb = parseCcpProductIdsFromAlertConfig(row[COLS.ALERT_CONFIG]);
  const proIds = inferAdobeProProductIdSet(asApiUsers, admin, pinnedFromDb);
  const flagged = applyAdobeProFlags(asApiUsers, admin, pinnedFromDb);

  const out = {
    source: "user_account_mapping",
    adminEmail: row[COLS.EMAIL],
    org_name: row[COLS.ORG_NAME],
    license_status: row[COLS.LICENSE_STATUS],
    user_count_db: row[COLS.USER_COUNT],
    ccp_product_ids_from_db: pinnedFromDb,
    effective_ccp_product_ids: [...proIds],
    users: flagged.map((u) => ({
      email: u.email,
      name: u.name,
      hasProduct: u.hasProduct,
      product: u.product,
      products: u.products,
    })),
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.destroy().catch(() => {}));
