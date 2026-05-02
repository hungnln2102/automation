/**
 * Rate Limiting Middleware
 * Cấu hình qua env hoặc fallback theo NODE_ENV.
 *
 * Env vars:
 *   RATE_LIMIT_API_MAX       (default: prod 200, dev 500)
 *   RATE_LIMIT_AUTH_MAX      (default: prod 10, dev 30)
 *   RATE_LIMIT_SENSITIVE_MAX (default: prod 20, dev 50)
 *
 * @module middleware/rateLimiter
 */

const rateLimit = require("express-rate-limit");

const isProd = process.env.NODE_ENV === "production";

const envInt = (key, prodDefault, devDefault) => {
  const raw = process.env[key];
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return isProd ? prodDefault : devDefault;
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envInt("RATE_LIMIT_API_MAX", 200, 500),
  message: {
    error: "Quá nhiều requests từ IP này, vui lòng thử lại sau 15 phút.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envInt("RATE_LIMIT_AUTH_MAX", 10, 30),
  message: {
    error: "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
});

const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: envInt("RATE_LIMIT_SENSITIVE_MAX", 20, 50),
  message: {
    error: "Quá nhiều requests cho thao tác này. Vui lòng thử lại sau 1 giờ.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
  sensitiveLimiter,
};
