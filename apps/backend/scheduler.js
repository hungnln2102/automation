/**
 * Standalone entrypoint cho Scheduler process.
 * Chạy tách biệt khỏi API server để:
 *  - Cron job nặng (Playwright Adobe) không block event loop API
 *  - Scheduler crash không kéo API chết
 *
 * Usage:
 *   node scheduler.js
 *   npm run start:scheduler
 *   node scheduler.js --run-expired-cleanup-once   # xóa user list_user hết hạn (một lần)
 *   npm run start:scheduler:expired-cleanup-once
 */
// Cùng .env + .env.local với API — không phụ thuộc cwd khi systemd/docker đổi thư mục làm việc.
const { loadBackendEnv } = require("./src/config/loadEnv");
loadBackendEnv();

const logger = require("./src/utils/logger");
const { notifyCritical } = require("./src/utils/telegramErrorNotifier");

process.on("uncaughtException", (err) => {
  logger.error("[SCHEDULER][FATAL] uncaughtException", {
    error: err.message,
    stack: err.stack,
  });
  notifyCritical({
    message: `[Scheduler] uncaughtException: ${err.message}`,
    stack: err.stack,
    extra: "Scheduler sẽ tắt trong 3 giây",
  });
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error("[SCHEDULER][FATAL] unhandledRejection", { error: msg, stack });
  notifyCritical({ message: `[Scheduler] unhandledRejection: ${msg}`, stack });
});

if (process.argv.includes("--run-adobe-once")) {
  const { renewAdobeCheckAndNotifyTask } = require("./src/scheduler/taskInstances");
  logger.info(
    "[Scheduler] CLI --run-adobe-once: chạy job check tài khoản Adobe (cùng logic trigger=cron, dùng backend/.env hiện tại)"
  );
  renewAdobeCheckAndNotifyTask("cron")
    .then(() => {
      logger.info("[Scheduler] CLI --run-adobe-once hoàn thành.");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("[Scheduler] CLI --run-adobe-once thất bại", {
        error: err.message,
        stack: err.stack,
      });
      process.exit(1);
    });
} else if (process.argv.includes("--run-expired-cleanup-once")) {
  const { cleanupExpiredListUsersTask } = require("./src/scheduler/taskInstances");
  logger.info(
    "[Scheduler] CLI --run-expired-cleanup-once: xóa user list_user hết hạn (cùng logic cron 00:01)"
  );
  cleanupExpiredListUsersTask("manual")
    .then(() => {
      logger.info("[Scheduler] CLI --run-expired-cleanup-once hoàn thành.");
      process.exit(0);
    })
    .catch((err) => {
      logger.error("[Scheduler] CLI --run-expired-cleanup-once thất bại", {
        error: err.message,
        stack: err.stack,
      });
      process.exit(1);
    });
} else {
  require("./src/scheduler");
}
