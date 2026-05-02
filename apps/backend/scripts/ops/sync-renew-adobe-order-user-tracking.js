/**
 * Backfill / đồng bộ một lần toàn bộ đơn renew_adobe → system_automation.order_user_tracking.
 *
 * Khuyến nghị: KHÔNG gắn cron chạy liên tục. Server đã cập nhật từng đơn sau:
 *   - Check tài khoản admin (runCheckForAccountId)
 *   - Batch add user / auto-assign / post-check-fix
 *
 * Usage (từ thư mục backend):
 *   node scripts/ops/sync-renew-adobe-order-user-tracking.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const {
  syncAllRenewAdobeOrderUserTracking,
} = require("../../src/services/renew-adobe/orderUserTrackingService");

async function main() {
  const { upserted } = await syncAllRenewAdobeOrderUserTracking();
  console.log(`[sync-order-user-tracking] Hoàn tất, upserted=${upserted}.`);
  return { upserted };
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[sync-order-user-tracking] Lỗi:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
