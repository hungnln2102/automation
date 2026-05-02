const logger = require("../utils/logger");

function toBool(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const isProduction = process.env.NODE_ENV === "production";
const REDIS_URL = String(process.env.REDIS_URL || "").trim();
const REDIS_HOST = String(process.env.REDIS_HOST || "").trim();
const REDIS_PORT = toInt(process.env.REDIS_PORT, 6379);
const REDIS_PASSWORD = String(process.env.REDIS_PASSWORD || "").trim();
const REDIS_DB = toInt(process.env.REDIS_DB, 0);
const REDIS_TLS = toBool(process.env.REDIS_TLS, false);
const REDIS_CONNECT_TIMEOUT_MS = toInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 5000);
const REDIS_ERROR_LOG_INTERVAL_MS = toInt(
  process.env.REDIS_ERROR_LOG_INTERVAL_MS,
  30000
);
const REDIS_MAX_RETRIES = toInt(
  process.env.REDIS_MAX_RETRIES,
  isProduction ? 20 : 2
);
const REDIS_ENABLED = toBool(
  process.env.REDIS_ENABLED,
  Boolean(REDIS_URL || REDIS_HOST)
);

function buildRedisConnectionConfig() {
  if (REDIS_URL) {
    return {
      kind: "url",
      target: REDIS_URL,
      options: {
        tls: REDIS_TLS ? {} : undefined,
      },
    };
  }
  if (REDIS_HOST) {
    return {
      kind: "host",
      target: `${REDIS_HOST}:${REDIS_PORT}`,
      options: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD || undefined,
        db: REDIS_DB,
        tls: REDIS_TLS ? {} : undefined,
      },
    };
  }
  return null;
}

let redisClient = null;
let redisAvailable = false;
const warnLogAtByKey = new Map();

function throttledWarn(key, message, intervalMs = REDIS_ERROR_LOG_INTERVAL_MS) {
  const now = Date.now();
  const lastAt = warnLogAtByKey.get(key) || 0;
  if (now - lastAt >= intervalMs) {
    warnLogAtByKey.set(key, now);
    logger.warn(message);
  }
}

const redisConnection = buildRedisConnectionConfig();

if (REDIS_ENABLED && redisConnection) {
  let Redis;
  try {
    Redis = require("ioredis");
  } catch {
    logger.warn("[Redis] ioredis not installed — running without Redis");
  }

  if (!Redis) {
    // skip
  } else {
    const commonOptions = {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      retryStrategy(times) {
        if (times > REDIS_MAX_RETRIES) {
          logger.warn(
            "[Redis] Max reconnect attempts reached (%d), disabling reconnect",
            REDIS_MAX_RETRIES
          );
          return null;
        }
        const delay = Math.min(times * 200, 5000);
        throttledWarn(
          "redis-reconnect",
          `[Redis] Reconnecting in ${delay}ms (attempt ${times})`,
          5000
        );
        return delay;
      },
      reconnectOnError(err) {
        const targetErrors = ["READONLY", "ECONNRESET"];
        return targetErrors.some((e) => err.message.includes(e));
      },
    };

    redisClient =
      redisConnection.kind === "url"
        ? new Redis(redisConnection.target, {
            ...commonOptions,
            ...redisConnection.options,
          })
        : new Redis({
            ...commonOptions,
            ...redisConnection.options,
          });

    redisClient.on("connect", () => {
      logger.info("[Redis] Connected");
    });

    redisClient.on("ready", () => {
      redisAvailable = true;
      logger.info(
        "[Redis] Ready to accept commands (target=%s)",
        redisConnection.target
      );
    });

    redisClient.on("error", (err) => {
      redisAvailable = false;
      throttledWarn("redis-error", `[Redis] Error: ${err.message}`);
    });

    redisClient.on("close", () => {
      redisAvailable = false;
      throttledWarn("redis-close", "[Redis] Connection closed", 5000);
    });
  }
} else if (!REDIS_ENABLED) {
  logger.info("[Redis] Disabled by REDIS_ENABLED=false");
} else {
  logger.info(
    "[Redis] REDIS_URL/REDIS_HOST not set — running without Redis"
  );
}

const isRedisAvailable = () => redisAvailable && redisClient !== null;

module.exports = { redisClient, isRedisAvailable };
