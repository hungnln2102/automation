/**
 * Test login/check Adobe.
 *
 * Chạy:
 *   node tests/manual/test-http-login.js <email> <password>
 * Hoặc:
 *   node tests/manual/test-http-login.js (dùng account đầu tiên từ DB)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { checkAccount } = require("../../src/services/renew-adobe/adobe-renew-v2");

const email = process.argv[2] || "";
const password = process.argv[3] || "";

(async () => {
  if (!email || !password) {
    console.log("Usage: node tests/manual/test-http-login.js <email> <password>");
    console.log("\nThử lấy account đầu tiên từ DB...");

    try {
      const { db } = require("../../src/db");
      const {
        SCHEMA_RENEW_ADOBE,
        RENEW_ADOBE_SCHEMA,
        tableName,
      } = require("../../src/config/dbSchema");
      const TABLE_DEF = RENEW_ADOBE_SCHEMA.ACCOUNT;
      const TABLE = tableName(TABLE_DEF.TABLE, SCHEMA_RENEW_ADOBE);
      const COLS = TABLE_DEF.COLS;

      const row = await db(TABLE)
        .select(COLS.EMAIL, COLS.PASSWORD_ENC, COLS.ALERT_CONFIG)
        .whereNotNull(COLS.EMAIL)
        .whereNotNull(COLS.PASSWORD_ENC)
        .first();

      if (!row) {
        console.error("Không có account nào trong DB.");
        process.exit(1);
      }

      console.log("Test với account:", row[COLS.EMAIL]);
      const result = await checkAccount(row[COLS.EMAIL], row[COLS.PASSWORD_ENC], {
        savedCookiesFromDb: row[COLS.ALERT_CONFIG] || null,
      });

      console.log("\n=== KẾT QUẢ ===");
      console.log("Success:", result.success);
      if (result.success) {
        console.log("License:", result.scrapedData?.licenseStatus);
        console.log("Users:", result.scrapedData?.userCount);
        console.log("Org ID:", result.scrapedData?.adobe_org_id);
        console.log(
          "Members:",
          JSON.stringify(result.scrapedData?.manageTeamMembers, null, 2)
        );
      } else {
        console.log("Error:", result.error);
        console.log("Login results:", JSON.stringify(result.loginResults, null, 2));
      }

      await db.destroy();
      process.exit(result.success ? 0 : 1);
    } catch (e) {
      console.error("Lỗi:", e.message);
      process.exit(1);
    }
  } else {
    console.log("Test check/login với:", email);

    const result = await checkAccount(email, password);

    console.log("\n=== KẾT QUẢ ===");
    console.log("Success:", result.success);
    if (result.success) {
      console.log("License:", result.scrapedData?.licenseStatus);
      console.log("Users:", result.scrapedData?.userCount);
      console.log("Org ID:", result.scrapedData?.adobe_org_id);
      console.log(
        "Members:",
        JSON.stringify(result.scrapedData?.manageTeamMembers, null, 2)
      );
    } else {
      console.log("Error:", result.error);
      if (result.loginResults) {
        console.log("\n--- Chi tiết từng endpoint ---");
        for (const r of result.loginResults) {
          console.log(`\n${r.url}:`);
          console.log("  Status:", r.status || r.error);
          if (r.data) {
            const preview =
              typeof r.data === "string"
                ? r.data.slice(0, 500)
                : JSON.stringify(r.data).slice(0, 500);
            console.log("  Response:", preview);
          }
        }
      }
    }

    process.exit(result.success ? 0 : 1);
  }
})();
