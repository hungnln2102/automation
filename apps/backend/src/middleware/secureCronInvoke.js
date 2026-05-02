const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Bảo vệ gọi job nội bộ (cron) bằng `CRON_INVOKE_SECRET` — thân `GET` công khai
 * sẽ không còn kích hoạt job. So khớp an toàn thời gian.
 */
function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getProvidedSecret(req) {
  if (req.query && (req.query.secret != null || req.query.key != null)) {
    return String(req.query.secret ?? req.query.key ?? "").trim();
  }
  const h = req.get("x-cron-invoke-secret") || req.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : h.trim();
}

/**
 * Dùng sau khi cấu hình env; nếu chưa cấu hình → 501 (bật bằng cách set CRON_INVOKE_SECRET).
 */
function requireCronInvokeSecret(req, res, next) {
  const expected = (process.env.CRON_INVOKE_SECRET || "").trim();
  if (!expected) {
    logger.warn(
      "[security] Gọi job cron: chưa cấu hình CRON_INVOKE_SECRET — từ chối. Dùng GET /api/scheduler/... sau khi đăng nhập, hoặc set secret."
    );
    return res.status(501).json({
      error:
        "Gọi job lịch: cấu hình CRON_INVOKE_SECRET (hoặc dùng /api/scheduler/... với session admin).",
    });
  }
  const got = getProvidedSecret(req);
  if (!got || !timingSafeEqualStr(got, expected)) {
    return res.status(401).json({ error: "Chữ ký cron không hợp lệ." });
  }
  return next();
}

module.exports = {
  requireCronInvokeSecret,
};
