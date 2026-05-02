/**
 * Debug script: chạy checkAccount V2 với account thật từ DB để lấy stack trace đầy đủ.
 * Usage: node scripts/debug-check-real.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

async function main() {
  const { db } = require("../src/db");
  const { RENEW_ADOBE_SCHEMA, SCHEMA_RENEW_ADOBE, tableName } = require("../src/config/dbSchema");
  const adobeRenewV2 = require("../src/services/renew-adobe/adobe-renew-v2");

  const TABLE = tableName(RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE, SCHEMA_RENEW_ADOBE);
  const COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

  // Lấy account đầu tiên (ID 1)
  const account = await db(TABLE).where(COLS.ID, 1).first();
  if (!account) {
    console.error("[debug] Không tìm thấy account ID 1");
    process.exit(1);
  }

  console.log("[debug] Account email:", account[COLS.EMAIL]);
  console.log("[debug] Has password:", !!account[COLS.PASSWORD_ENC]);

  const email = account[COLS.EMAIL];
  const password = account[COLS.PASSWORD_ENC] || "";

  console.log("[debug] Đang chạy checkAccount...");
  try {
    const result = await adobeRenewV2.checkAccount(email, password, {
      savedCookiesFromDb: account[COLS.ALERT_CONFIG] || null,
      mailBackupId: null,
    });
    console.log("[debug] checkAccount result:", JSON.stringify({
      success: result.success,
      error: result.error,
      orgName: result.scrapedData?.orgName,
      licenseStatus: result.scrapedData?.licenseStatus,
      userCount: result.scrapedData?.userCount,
    }, null, 2));
  } catch (err) {
    console.error("[debug] CAUGHT ERROR:", err.message);
    console.error("[debug] STACK TRACE:\n", err.stack);
  }

  await db.destroy();
}

main().then(() => {
  console.log("[debug] Done");
  process.exit(0);
}).catch(err => {
  console.error("[debug] Fatal:", err.stack);
  process.exit(1);
});
