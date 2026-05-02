const crypto = require("crypto");
const logger = require("../utils/logger");

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function getHeaderKey(req) {
  const a = req.get("x-renew-public-key");
  if (a && String(a).trim()) return String(a).trim();
  const auth = req.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

/**
 * POST /api/renew-adobe/public/activate — tránh kích hoạt chỉ bằng email.
 * - Không cấu hình RENEW_ADOBE_PUBLIC_API_KEY: cho phép (tương thích dev/legacy).
 * - Có cấu hình: bắt buộc header trùng (proxy store nên gắn, không lộ ra browser nếu BFF cấp header).
 */
function requireRenewAdobePublicActivateKey(req, res, next) {
  const expected = (process.env.RENEW_ADOBE_PUBLIC_API_KEY || "").trim();
  if (!expected) {
    return next();
  }
  const got = getHeaderKey(req);
  if (!got || !timingSafeEqualStr(got, expected)) {
    if (process.env.NODE_ENV === "production") {
      logger.warn("[renew-adobe][public] activate: thiếu hoặc sai RENEW_ADOBE_PUBLIC_API_KEY");
    }
    return res.status(401).json({
      success: false,
      error: "Thiếu hoặc sai khóa kích hoạt công khai (X-Renew-Public-Key / Bearer).",
    });
  }
  return next();
}

module.exports = {
  requireRenewAdobePublicActivateKey,
};
