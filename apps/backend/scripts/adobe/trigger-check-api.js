/**
 * Trigger check account ngay khi server chạy — cần session.
 * Script này KHÔNG dùng API, mà gọi trực tiếp hàm runCheckForAccountId.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

async function main() {
  const adobeRenewV2 = require("../src/services/renew-adobe/adobe-renew-v2");

  console.log("DEBUG: typeof adobeRenewV2.checkAccount =", typeof adobeRenewV2.checkAccount);
  console.log("DEBUG: adobeRenewV2 keys =", Object.keys(adobeRenewV2).join(", "));
  console.log("DEBUG: checkAccount.toString (first 200 chars):", String(adobeRenewV2.checkAccount).slice(0, 200));

  const { db } = require("../src/db");
  const { RENEW_ADOBE_SCHEMA, SCHEMA_RENEW_ADOBE, tableName } = require("../src/config/dbSchema");
  const TABLE = tableName(RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE, SCHEMA_RENEW_ADOBE);
  const COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

  const account = await db(TABLE).where(COLS.ID, 1).first();
  if (!account) { console.error("No account 1"); process.exit(1); }

  const email = account[COLS.EMAIL];
  const password = account[COLS.PASSWORD_ENC] || "";

  console.log("Calling checkAccount for", email);
  const t0 = Date.now();
  try {
    const result = await adobeRenewV2.checkAccount(email, password, {
      savedCookiesFromDb: COLS.ALERT_CONFIG ? account[COLS.ALERT_CONFIG] : null,
      mailBackupId: null,
    });
    console.log("Result in", Date.now() - t0, "ms:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error in", Date.now() - t0, "ms:", err.message);
    console.error("Stack:", err.stack);
  }
  await db.destroy();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
