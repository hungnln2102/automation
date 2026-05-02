const logger = require("../utils/logger");

const HEADER = "x-renew-internal-key";

/**
 * Bảo vệ service Renew Adobe khi chạy tách process: chỉ chấp nhận
 * yêu cầu từ Orderlist (proxy) gửi kèm cùng khóa bí mật nội bộ.
 * Không gắn trên in-process /api/renew-adobe — chỉ dùng trên `services/renew-adobe-api`.
 */
function renewAdobeInternalAuth(req, res, next) {
  const expected = (process.env.RENEW_ADOBE_INTERNAL_KEY || "").trim();
  if (!expected) {
    logger.error(
      "[renew-adobe] RENEW_ADOBE_INTERNAL_KEY is required when running the Renew Adobe API as a separate process"
    );
    return res
      .status(503)
      .json({ error: "Renew Adobe API: chưa cấu hình RENEW_ADOBE_INTERNAL_KEY." });
  }

  const got = String(req.headers[HEADER.toLowerCase()] || "").trim();

  if (got !== expected) {
    return res.status(401).json({ error: "Invalid or missing internal key." });
  }

  return next();
}

module.exports = {
  renewAdobeInternalAuth,
  RENEW_ADOBE_INTERNAL_KEY_HEADER: HEADER,
};
