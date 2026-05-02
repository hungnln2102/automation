/**
 * Centralized Error Handling Middleware
 * Provides consistent error responses across the application.
 * Lỗi 5xx tự động gửi Telegram qua logger.error() → Winston transport.
 */

const logger = require("../utils/logger");

class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguish operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 * Must be registered AFTER all routes
 */
const errorHandler = (err, req, res, next) => {
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || "Đã xảy ra lỗi không xác định";
  let code = err.code || "INTERNAL_ERROR";
  let details = err.details || null;

  // Handle specific error types
  if (err.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Dữ liệu không hợp lệ";
  } else if (err.name === "UnauthorizedError") {
    statusCode = 401;
    code = "UNAUTHORIZED";
    message = "Không có quyền truy cập";
  } else if (err.code === "23505") {
    // PostgreSQL unique violation
    statusCode = 409;
    code = "DUPLICATE_ENTRY";
    message = "Dữ liệu đã tồn tại";
  } else if (err.code === "23503") {
    // PostgreSQL foreign key violation
    statusCode = 400;
    code = "FOREIGN_KEY_VIOLATION";
    message = "Dữ liệu tham chiếu không hợp lệ";
  }

  // Log error for debugging
  if (statusCode >= 500) {
    logger.error("Error Handler", {
      message: err.message,
      code,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      statusCode,
    });
  } else {
    // Log non-500 errors at warn level
    logger.warn("Error Handler", {
      message: err.message,
      code,
      url: req.originalUrl,
      method: req.method,
      statusCode,
    });
  }

  // Send error response
  const response = {
    error: message,
    code,
  };

  // Include details in development mode
  if (process.env.NODE_ENV !== "production" && details) {
    response.details = details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV !== "production" && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 Not Found handler
 * Must be registered BEFORE error handler but AFTER all routes
 */
/** 404 không đẩy lên Telegram: crawler/SEO; ảnh tĩnh thiếu file (DB còn URL) — không spam cảnh báo. */
const SILENT_404_PATTERN =
  /^\/($|_next|favicon\.ico|robots\.txt|sitemap\.xml|sitemap_index\.xml|llms\.txt|ads\.txt|\.well-known|image(?:_product|_variant)?\/)/i;

const notFoundHandler = (req, res, next) => {
  const pathOnly = String(req.originalUrl || "").split("?")[0];
  if (SILENT_404_PATTERN.test(pathOnly)) {
    return res.status(404).json({ error: "Not Found" });
  }

  const error = new AppError(
    `Không tìm thấy đường dẫn: ${req.originalUrl}`,
    404,
    "NOT_FOUND"
  );
  next(error);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
