/**
 * Check tuần tự mọi tài khoản admin Adobe đang active (get user / license từ Adobe),
 * cập nhật DB + order_user_tracking — KHÔNG chạy auto-assign (không add user mới).
 *
 * Giống GET /accounts/check-all nhưng bỏ bước auto-assign sau cùng.
 *
 * Usage (từ thư mục backend):
 *   node scripts/ops/check-all-sync-order-user-tracking.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { runCheckForAccountId } = require("../../src/controllers/RenewAdobeController/checkAccounts");
const {
  runCheckAllAccountsFlow,
} = require("../../src/controllers/RenewAdobeController/autoAssign");
const { db } = require("../../src/db");

async function main() {
  const result = await runCheckAllAccountsFlow({
    runCheckForAccountId,
    includeAutoAssign: false,
    logPrefix: "[ops][check-all-sync-tracking]",
    onEvent: (data) => {
      const t = data && data.type;
      if (
        t === "start" ||
        t === "checking" ||
        t === "done" ||
        t === "error" ||
        t === "complete"
      ) {
        console.log(JSON.stringify(data));
      }
    },
  });
  console.log(
    "[check-all-sync-order-user-tracking] Hoàn tất:",
    JSON.stringify({
      total: result.total,
      completed: result.completed,
      failed: result.failed,
    })
  );
  await db.destroy();
  return result;
}

main().catch(async (err) => {
  console.error("[check-all-sync-order-user-tracking] Lỗi:", err.message);
  console.error(err.stack);
  try {
    await db.destroy();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
