/**
 * Debug script: chạy checkAccount V2 isolation và in stack trace đầy đủ.
 * Usage: node scripts/debug-check-account.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

async function main() {
  console.log("[debug] Loading adobeRenewV2...");
  const adobeRenewV2 = require("../src/services/renew-adobe/adobe-renew-v2");
  console.log("[debug] Loaded OK. checkAccount:", typeof adobeRenewV2.checkAccount);

  // Test với email/password giả để xem lỗi nào throw trước khi Playwright bắt đầu
  try {
    const result = await adobeRenewV2.checkAccount("test@test.com", "fakepassword123", {
      savedCookiesFromDb: null,
      mailBackupId: null,
    });
    console.log("[debug] checkAccount result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("[debug] CAUGHT ERROR:", err.message);
    console.error("[debug] STACK:", err.stack);
  }
}

main().then(() => {
  console.log("[debug] Done");
  process.exit(0);
}).catch(err => {
  console.error("[debug] Fatal:", err);
  process.exit(1);
});
