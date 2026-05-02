/**
 * Centralized logging utility using Winston
 * Replaces console.log/error throughout the application
 */

const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colors for console output
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

winston.addColors(colors);

// Custom format for log messages
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format (more readable)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    let metaStr = "";
    if (Object.keys(meta).length > 0 && meta.stack === undefined) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    if (meta.stack) {
      metaStr = `\n${meta.stack}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");

// Create transports
const transports = [
  // Console transport (always enabled)
  new winston.transports.Console({
    format: consoleFormat,
    level: logLevel,
  }),
];

// File transports (only in production or if LOG_FILE is set)
if (process.env.NODE_ENV === "production" || process.env.LOG_FILE) {
  const logFile = process.env.LOG_FILE || path.join(logsDir, "app.log");
  const maxSize = process.env.LOG_MAX_SIZE || "10m";
  const maxFiles = process.env.LOG_MAX_FILES || "5";

  // Daily rotate file for all logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, "app-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize,
      maxFiles,
      format: logFormat,
      level: logLevel,
    })
  );

  // Separate file for errors
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize,
      maxFiles,
      format: logFormat,
      level: "error",
    })
  );
}

// Telegram notification transport (error + warn)
try {
  const { notifyError, notifyWarn } = require("./telegramErrorNotifier");
  const splatKey = Symbol.for("splat");

  const extractPayload = (info) => {
    const splat = info[splatKey]?.[0] || {};
    const status = info.status ?? info.statusCode ?? splat.status;
    const body = info.body ?? splat.body;
    const extraParts = [];
    if (status != null) extraParts.push(`HTTP ${status}`);
    if (body != null && String(body).trim()) {
      const b = String(body).replace(/\s+/g, " ").trim();
      extraParts.push(b.length > 320 ? `${b.slice(0, 320)}…` : b);
    }
    if (!extraParts.length && splat.error) extraParts.push(String(splat.error));
    return {
      message: info.message,
      source: "backend",
      url: info.url || splat.url,
      method: info.method || splat.method,
      stack: info.stack || splat.stack,
      extra: extraParts.length ? extraParts.join(" — ") : undefined,
    };
  };

  const TelegramErrorTransport = class extends winston.Transport {
    log(info, callback) {
      setImmediate(() => {
        if (String(info.message || "").includes("[ErrorNotifier]")) return;
        notifyError(extractPayload(info));
      });
      callback();
    }
  };

  const TelegramWarnTransport = class extends winston.Transport {
    log(info, callback) {
      setImmediate(() => {
        if (String(info.message || "").includes("[ErrorNotifier]")) return;
        notifyWarn(extractPayload(info));
      });
      callback();
    }
  };

  transports.push(new TelegramErrorTransport({ level: "error" }));
  transports.push(new TelegramWarnTransport({ level: "warn" }));
} catch (err) {
  console.warn("[Logger] Could not load Telegram error notifier:", err.message);
}

// Create logger instance
const logger = winston.createLogger({
  levels,
  level: logLevel,
  format: logFormat,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Create a stream object for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Helper to log with context
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context
 */
const logWithContext = (level, message, context = {}) => {
  logger[level](message, context);
};

/**
 * Create a child logger with default context
 * @param {Object} defaultContext - Default context to include in all logs
 * @returns {Object} Child logger instance
 */
logger.child = (defaultContext = {}) => {
  return {
    error: (message, context = {}) => logger.error(message, { ...defaultContext, ...context }),
    warn: (message, context = {}) => logger.warn(message, { ...defaultContext, ...context }),
    info: (message, context = {}) => logger.info(message, { ...defaultContext, ...context }),
    http: (message, context = {}) => logger.http(message, { ...defaultContext, ...context }),
    debug: (message, context = {}) => logger.debug(message, { ...defaultContext, ...context }),
  };
};

module.exports = logger;
