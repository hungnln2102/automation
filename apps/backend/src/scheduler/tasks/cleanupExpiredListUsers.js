const logger = require("../../utils/logger");
const {
  cleanupExpiredListUsers,
} = require("../../services/renew-adobe/expiredListUserCleanupService");

/** Tránh hai lần gọi chồng nhau nếu job chạy lâu. */
let cleanupExpiredListUsersInFlight = false;

function createCleanupExpiredListUsersTask() {
  return async function cleanupExpiredListUsersTask(trigger = "cron") {
    if (cleanupExpiredListUsersInFlight) {
      logger.warn(
        "[CRON] cleanupExpiredListUsers vẫn đang chạy — bỏ qua lần gọi trùng",
        { trigger }
      );
      return { skipped: true, trigger };
    }

    cleanupExpiredListUsersInFlight = true;
    logger.info("[CRON] Bắt đầu cleanup user list_user hết hạn", { trigger });

    try {
      const result = await cleanupExpiredListUsers(trigger);
      logger.info("[CRON] Kết thúc cleanup user list_user hết hạn", { trigger, ...result });
      return result;
    } catch (err) {
      logger.error("[CRON] cleanupExpiredListUsers thất bại", {
        trigger,
        error: err.message,
        stack: err.stack,
      });
      throw err;
    } finally {
      cleanupExpiredListUsersInFlight = false;
    }
  };
}

module.exports = {
  createCleanupExpiredListUsersTask,
};
