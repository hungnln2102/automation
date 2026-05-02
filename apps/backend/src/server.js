const app = require("./app");
const { port } = require("./config/appConfig");
const { ensureDefaultAdmin } = require("./controllers/AuthController");
const logger = require("./utils/logger");
const { notifyCritical } = require("./utils/telegramErrorNotifier");

process.on("uncaughtException", (err) => {
  logger.error("[FATAL] uncaughtException", { error: err.message, stack: err.stack });
  notifyCritical({
    message: `uncaughtException: ${err.message}`,
    stack: err.stack,
    extra: "Server sẽ tắt trong 3 giây",
  });
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error("[FATAL] unhandledRejection", { error: msg, stack });
  notifyCritical({ message: `unhandledRejection: ${msg}`, stack });
});

ensureDefaultAdmin().catch((err) =>
  logger.error("[AUTH] ensureDefaultAdmin thất bại", { error: err.message, stack: err.stack })
);

const server = app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});

server.requestTimeout  = 60_000;   // 60s nhận full request (body)
server.headersTimeout  = 65_000;   // > requestTimeout (Node.js yêu cầu)
server.keepAliveTimeout = 65_000;  // chuẩn Nginx upstream

module.exports = app;
