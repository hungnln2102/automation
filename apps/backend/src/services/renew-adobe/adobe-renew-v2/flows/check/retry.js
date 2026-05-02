const logger = require("../../../../../utils/logger");

function isRecoverableCheckError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("net::") ||
    msg.includes("navigation") ||
    msg.includes("execution context was destroyed") ||
    msg.includes("target closed") ||
    msg.includes("protocol error")
  );
}

async function withRecoverableRetry(stepName, action, { retries = 1, waitMs = 1200 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      const recoverable = isRecoverableCheckError(error);
      if (!recoverable || attempt >= retries) break;
      logger.warn(
        "[adobe-v2] %s recoverable error (attempt %d/%d): %s",
        stepName,
        attempt + 1,
        retries + 1,
        error.message
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

module.exports = {
  isRecoverableCheckError,
  withRecoverableRetry,
};
