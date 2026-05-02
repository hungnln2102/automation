const logger = require("../../utils/logger");
const { runRenewAdobeCleanup2330Flow } = require("./renewAdobeCleanup2330Flow");
const ENABLE_2330_CLEANUP = process.env.RENEW_ADOBE_ENABLE_2330_CLEANUP !== "false";
/** Tắt mặc định: check-all toàn tài khoản trước cleanup dễ lệch/ nặng session; bật rõ: =true. */
const ENABLE_2330_CHECK_BEFORE_CLEANUP =
  process.env.RENEW_ADOBE_ENABLE_2330_CHECK_BEFORE_CLEANUP === "true";
let cleanupExpiredAdobeUsersInFlight = false;

function createCleanupExpiredAdobeUsersTask() {
  return async function cleanupExpiredAdobeUsersTask(trigger = "cron") {
    if (!ENABLE_2330_CLEANUP) {
      logger.info("[CRON] Bỏ qua cleanup expired Adobe users (feature disabled)", {
        trigger,
        pid: process.pid,
      });
      return;
    }
    if (cleanupExpiredAdobeUsersInFlight) {
      logger.warn(
        "[CRON] Job cleanup expired Adobe users đang chạy — bỏ qua lần gọi trùng",
        { trigger, pid: process.pid }
      );
      return;
    }
    cleanupExpiredAdobeUsersInFlight = true;
    logger.info("[CRON] Bắt đầu cleanup expired Adobe users", { trigger });

    try {
      const summary = await runRenewAdobeCleanup2330Flow({
        trigger,
        runCheckBeforeCleanup: ENABLE_2330_CHECK_BEFORE_CLEANUP,
      });
      logger.info("[CRON] Cleanup expired Adobe users hoàn tất", {
        trigger,
        usersToRemove: summary.usersToRemove,
        usersRemoved: summary.usersRemoved,
        failedUsers: summary.failedUsers,
        failedAccounts: summary.failedAccounts.length,
      });
    } catch (err) {
      logger.error("[CRON] Cleanup expired Adobe users thất bại", { error: err.message, stack: err.stack });
    } finally {
      cleanupExpiredAdobeUsersInFlight = false;
    }
  };
}

module.exports = { createCleanupExpiredAdobeUsersTask };
