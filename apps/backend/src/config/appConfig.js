const { loadBackendEnv } = require("./loadEnv");

loadBackendEnv();

const port = Number(process.env.PORT) || 3001;
const SEPAY_PORT = Number(process.env.SEPAY_PORT) || 5000;
const SEPAY_HOST = process.env.SEPAY_HOST || "0.0.0.0";

const normalizeOrigin = (origin) => {
  if (typeof origin !== "string") {
    return "";
  }

  const trimmedOrigin = origin.trim();
  if (!trimmedOrigin) {
    return "";
  }

  try {
    return new URL(trimmedOrigin).origin.toLowerCase();
  } catch {
    return trimmedOrigin.replace(/\/+$/, "").toLowerCase();
  }
};

const isProd = process.env.NODE_ENV === "production";

/** Origins từ env (hoặc mặc định admin Vite + Website Vite khi chưa set). */
const rawFrontends =
  process.env.FRONTEND_ORIGINS ||
  "http://localhost:5173,http://localhost:4001";
const fromEnv = rawFrontends
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

/**
 * LOCAL: storefront Renew Adobe chạy Vite :4001, proxy tới admin — Origin vẫn là :4001.
 * Nếu FRONTEND_ORIGINS chỉ có production/staging, thiếu 4001 → POST activate báo CORS.
 * 127.0.0.1 khác origin với localhost nên thêm cả hai.
 */
const devOriginExtras = isProd
    ? []
    : [
      "http://localhost:4001",
      "http://127.0.0.1:4001",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4000",
      "http://127.0.0.1:4000",
      "http://localhost:6001",
      "http://127.0.0.1:6001",
    ]
      .map(normalizeOrigin)
      .filter(Boolean);

const allowedOrigins = Array.from(new Set([...fromEnv, ...devOriginExtras]));
const allowedOriginSet = new Set(allowedOrigins);

const sessionName =
  process.env.SESSION_NAME ||
  `${(process.env.APP_NAME || "session").replace(/[^a-z0-9]/gi, "").toLowerCase() || "session"}.sid`;
const cookieSecureEnv = (process.env.COOKIE_SECURE || "").trim().toLowerCase();
const hasHttpOrigin = allowedOrigins.some((origin) =>
  origin.toLowerCase().startsWith("http://")
);

// Allow "auto" to support both HTTP (local) and HTTPS (prod) without breaking sessions.
// If a non-HTTPS origin is present, fall back to "auto" even when COOKIE_SECURE=true
// so that dev environments still receive the session cookie.
let cookieSecure =
  cookieSecureEnv === "auto"
    ? "auto"
    : cookieSecureEnv === "true" ||
      cookieSecureEnv === "1" ||
      (!cookieSecureEnv && isProd && !hasHttpOrigin);

if (cookieSecure === true && hasHttpOrigin) {
  cookieSecure = "auto";
}

const cookieSameSite = cookieSecure === true ? "none" : "lax";

/** % thuế ước tính trên doanh thu tháng (ô "Thuế của tháng" dashboard). 0 = 0 ₫. */
const rawDashboardTax = process.env.DASHBOARD_MONTHLY_TAX_RATE_PERCENT;
const parsedDashboardTax =
  rawDashboardTax === undefined || String(rawDashboardTax).trim() === ""
    ? 0
    : Number(rawDashboardTax);
const dashboardMonthlyTaxRatePercent = Number.isFinite(parsedDashboardTax)
  ? Math.min(100, Math.max(0, parsedDashboardTax))
  : 0;

/** 0–1: blend giá sinh viên (MAVS) giữa MAVC và MAVL khi variant_margin student NULL. */
const rawDefaultPctStu = process.env.DEFAULT_PCT_STU;
const parsedDefaultPctStu =
  rawDefaultPctStu === undefined || String(rawDefaultPctStu).trim() === ""
    ? 0.35
    : Number(rawDefaultPctStu);
const defaultPctStu =
  Number.isFinite(parsedDefaultPctStu) && parsedDefaultPctStu >= 0 && parsedDefaultPctStu <= 1
    ? parsedDefaultPctStu
    : 0.35;

const sessionSecret = process.env.SESSION_SECRET || "change_this_secret";
if (isProd && (!process.env.SESSION_SECRET || sessionSecret === "change_this_secret")) {
  console.error(
    "[SECURITY] SESSION_SECRET không được set hoặc đang dùng default value trong production!"
  );
  process.exit(1);
}

module.exports = {
  port,
  allowedOrigins,
  allowedOriginSet,
  normalizeOrigin,
  dashboardMonthlyTaxRatePercent,
  defaultPctStu,
  sepay: {
    host: SEPAY_HOST,
    port: SEPAY_PORT,
  },
  session: {
    name: sessionName,
    secret: sessionSecret,
    cookieSecure,
    cookieSameSite,
  },
};
