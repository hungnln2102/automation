const { createProxyMiddleware } = require("http-proxy-middleware");
const logger = require("../utils/logger");

const HEADER = "x-renew-internal-key";

/**
 * Khi `RENEW_ADOBE_API_BASE_URL` có giá trị, mọi `/api/renew-adobe/*` (sau khi qua
 * `authGuard`) được chuyển tiếp tới dịch vụ Renew Adobe process riêng, kèm
 * `RENEW_ADOBE_INTERNAL_KEY` — không tải lại controller nặng (Playwright) trong process Orderlist.
 */
function getRenewAdobeProxy() {
  const raw = (process.env.RENEW_ADOBE_API_BASE_URL || "").trim();
  if (!raw) {
    return null;
  }

  const target = raw.replace(/\/+$/, "");

  return createProxyMiddleware({
    target,
    changeOrigin: true,
    timeout: 900_000,
    proxyTimeout: 900_000,
    /** Mount lồng `/api` khiến `path` có thể không đủ — dùng `originalUrl`. */
    pathRewrite: (path, req) => {
      const full = String(
        (req.originalUrl && req.originalUrl.length > 0
          ? req.originalUrl
          : `${req.baseUrl || ""}${req.url || path || ""}`) || ""
      ).split("#")[0];
      try {
        const u = new URL(full, "http://127.0.0.1");
        return u.pathname + u.search;
      } catch (e) {
        logger.warn("[renew-adobe proxy] pathRewrite: %s", e.message);
        return path;
      }
    },
    on: {
      proxyReq: (proxyReq) => {
        const key = (process.env.RENEW_ADOBE_INTERNAL_KEY || "").trim();
        if (key) {
          proxyReq.setHeader(HEADER, key);
        }
      },
      error: (err, _req, res) => {
        logger.error("[renew-adobe proxy] %s", err.message);
        if (res && !res.headersSent && typeof res.status === "function") {
          res
            .status(502)
            .json({ error: "Không kết nối được tới dịch vụ Renew Adobe." });
        }
      },
    },
  });
}

module.exports = { getRenewAdobeProxy };
