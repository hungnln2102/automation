/**
 * Standalone entrypoint cho Sepay webhook server.
 * Chạy tách biệt khỏi API server để:
 *  - Webhook crash không kéo API chết
 *  - API quá tải không làm mất payment notification
 *
 * Usage:
 *   node webhook-server.js
 *   npm run start:webhook
 */
const { loadBackendEnv } = require("./src/config/loadEnv");
loadBackendEnv();

const logger = require("./src/utils/logger");
const { notifyCritical } = require("./src/utils/telegramErrorNotifier");

process.on("uncaughtException", (err) => {
  logger.error("[WEBHOOK][FATAL] uncaughtException", {
    error: err.message,
    stack: err.stack,
  });
  notifyCritical({
    message: `[Webhook] uncaughtException: ${err.message}`,
    stack: err.stack,
    extra: "Webhook server sẽ tắt trong 3 giây",
  });
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error("[WEBHOOK][FATAL] unhandledRejection", { error: msg, stack });
  notifyCritical({ message: `[Webhook] unhandledRejection: ${msg}`, stack });
});

const app = require("./webhook/sepay/app");
const { HOST, PORT, SEPAY_WEBHOOK_PATH } = require("./webhook/sepay/config");

const server = app.listen(PORT, HOST, () => {
  logger.info(
    `[Webhook] Sepay webhook listening at http://${HOST}:${PORT}${SEPAY_WEBHOOK_PATH}`
  );
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 65_000;
