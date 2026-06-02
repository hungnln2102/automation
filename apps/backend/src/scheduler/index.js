const cron = require("node-cron");
const logger = require("../utils/logger");
const {
  renewAdobeCheckAndNotifyTask,
  cleanupAdobeProfileGarbageTask,
  cleanupExpiredListUsersTask,
  getSchedulerStatus,
  schedulerTimezone,
} = require("./taskInstances");

const runRenewAdobeCheckSafe = (source) =>
  renewAdobeCheckAndNotifyTask(source).catch((err) =>
    logger.error(`[CRON] Renew Adobe check failed during ${source}`, {
      error: err.message,
      stack: err.stack,
    })
  );

const runCleanupAdobeProfileGarbageSafe = (source) =>
  cleanupAdobeProfileGarbageTask(source).catch((err) =>
    logger.error(`[CRON] Cleanup Adobe profile garbage failed during ${source}`, {
      error: err.message,
      stack: err.stack,
    })
  );

const runCleanupExpiredListUsersSafe = (source) =>
  cleanupExpiredListUsersTask(source).catch((err) =>
    logger.error(`[CRON] Cleanup expired list_user failed during ${source}`, {
      error: err.message,
      stack: err.stack,
    })
  );

if (require.main === module && process.argv.includes("--run-once")) {
  runRenewAdobeCheckSafe("manual");
}

cron.schedule(
  "1 0 * * *",
  () => runCleanupExpiredListUsersSafe("cron"),
  { scheduled: true, timezone: schedulerTimezone }
);

cron.schedule(
  "0 0 * * *",
  () => runCleanupAdobeProfileGarbageSafe("cron"),
  { scheduled: true, timezone: schedulerTimezone }
);

cron.schedule(
  "0 * * * *",
  () => runRenewAdobeCheckSafe("cron"),
  { scheduled: true, timezone: schedulerTimezone }
);

logger.info("[Scheduler] Đã khởi động scheduler Renew Adobe", {
  expiredListUserCron: "1 0 * * *",
  renewAdobeCron: "0 * * * *",
  cleanupProfileCron: "0 0 * * *",
  schedulerTimezone,
});

module.exports = {
  renewAdobeCheckAndNotifyTask,
  cleanupAdobeProfileGarbageTask,
  cleanupExpiredListUsersTask,
  getSchedulerStatus,
};
