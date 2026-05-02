/**
 * Job (cron mỗi giờ, xem scheduler/index.js): check tuần tự — runCheckForAccountId như POST /accounts/:id/check.
 * Tuỳ chọn khi env `RENEW_ADOBE_DELETE_ALL_WHEN_NO_CCP=true`: không còn token CCP trong id_product nhưng còn team → auto xóa hết user.
 * Trigger `cron`: sau check có thể auto-fix batch add qua `RENEW_ADOBE_ENABLE_POST_CHECK_FIX`.
 * Trigger `manual` (API /scheduler/run-adobe-check): hành vi cũ (includeAutoAssign=true).
 */
const logger = require("../../utils/logger");
const { runCheckForAccountId } = require("../../controllers/RenewAdobeController");
const { runCheckAllAccountsFlow } = require("../../controllers/RenewAdobeController/autoAssign");

/** Tránh hai lần gọi chồng nhau (cron mỗi giờ + job chạy lâu → Playwright/OOM/timeout). */
let renewAdobeCheckAllInFlight = false;

function createRenewAdobeCheckAndNotifyTask() {
  return async function renewAdobeCheckAndNotifyTask(trigger = "cron") {
    if (renewAdobeCheckAllInFlight) {
      logger.warn(
        "[CRON] Job Renew Adobe (check all) vẫn đang chạy — bỏ qua lần gọi trùng",
        { trigger, pid: process.pid }
      );
      return;
    }
    renewAdobeCheckAllInFlight = true;
    logger.info("[CRON] Bắt đầu job check all tài khoản Renew Adobe", {
      trigger,
      pid: process.pid,
    });
    try {
      const result = await runCheckAllAccountsFlow({
        runCheckForAccountId,
        logPrefix: "[CRON][check-all]",
      });
      logger.info("[CRON] Kết thúc job check all tài khoản Renew Adobe", {
        trigger,
        total: result.total,
        completed: result.completed,
        failed: result.failed,
      });
    } finally {
      renewAdobeCheckAllInFlight = false;
    }
  };
}

module.exports = { createRenewAdobeCheckAndNotifyTask };
