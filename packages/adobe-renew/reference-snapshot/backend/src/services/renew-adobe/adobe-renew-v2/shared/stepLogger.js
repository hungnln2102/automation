const logger = require("../../../../utils/logger");

function toSafeMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch (_) {
    return {};
  }
}

function createStepLogger(scope) {
  const s = String(scope || "adobe-v2");

  function log(level, step, message, meta = {}) {
    const payload = toSafeMeta(meta);
    const prefix = `[${s}] [${step}]`;
    logger[level](`${prefix} ${message}`, payload);
  }

  return {
    start(step, meta = {}) {
      log("info", step, "start", meta);
    },
    success(step, meta = {}) {
      log("info", step, "success", meta);
    },
    warn(step, message, meta = {}) {
      log("warn", step, message || "warn", meta);
    },
    fail(step, error, meta = {}) {
      const message = error instanceof Error ? error.message : String(error || "unknown_error");
      log("error", step, message, meta);
    },
  };
}

module.exports = {
  createStepLogger,
};
