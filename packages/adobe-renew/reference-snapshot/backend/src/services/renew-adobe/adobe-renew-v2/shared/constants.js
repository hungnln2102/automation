/**
 * Constants dùng chung cho Adobe Renew V2 (Playwright).
 */

/** Timeout (ms) dùng chung — có thể override bằng env ADOBE_* */
const TIMEOUTS = {
  LOGIN_PAGE: Number(process.env.ADOBE_TIMEOUT_LOGIN_PAGE) || 45000,
  URL_ADOBE_ORG: Number(process.env.ADOBE_TIMEOUT_URL_ORG) || 15000,
  API: Number(process.env.ADOBE_TIMEOUT_API) || 15000,
  TEST_TOKEN: Number(process.env.ADOBE_TIMEOUT_TEST_TOKEN) || 10000,
  NAVIGATE: Number(process.env.ADOBE_TIMEOUT_NAVIGATE) || 20000,
};

const ADOBE_IMS_BASE = "https://ims-na1.adobelogin.com";
const AUTH_SERVICES_BASE = "https://auth.services.adobe.com";
const ADMIN_CONSOLE_BASE = "https://adminconsole.adobe.com";
const ADOBE_WWW = "https://www.adobe.com";

const LOGIN_PAGE_URL =
  "https://auth.services.adobe.com/en_US/index.html?client_id=homepage_milo&scope=AdobeID%2Copenid%2Cgnav%2Cpps.read%2Cfirefly_api%2Cadditional_info.roles%2Cread_organizations%2Caccount_cluster.read&response_type=token&redirect_uri=https%3A%2F%2Fwww.adobe.com%2Fhome&flow_type=token&idp_flow_type=login&locale=en_US";

const CLIENT_ID = "homepage_milo";
const ADMIN_CONSOLE_CLIENT_ID = "ONESIE1";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

const ADMIN_CONSOLE_API_BASE = "https://bps-il.adobe.io";
const USER_MANAGEMENT_API = "https://usermanagement.adobe.io";

/**
 * Trang Adobe (mặc định https://www.adobe.com/manage-team) — fallback khi bắt header JIL (vd. products) không qua được Admin Console.
 * Products API ưu tiên adminconsole/.../products; embed chỉ dùng khi cần. Ghi đè bằng ADOBE_EMBED_PAGE_URL.
 */
function resolveAdobeEmbedPageUrl() {
  const raw = String(process.env.ADOBE_EMBED_PAGE_URL || "").trim();
  if (raw && /^https:\/\//i.test(raw)) {
    return raw;
  }
  return `${ADOBE_WWW}/manage-team`;
}

module.exports = {
  TIMEOUTS,
  ADOBE_IMS_BASE,
  AUTH_SERVICES_BASE,
  ADMIN_CONSOLE_BASE,
  ADOBE_WWW,
  LOGIN_PAGE_URL,
  CLIENT_ID,
  ADMIN_CONSOLE_CLIENT_ID,
  DEFAULT_HEADERS,
  ADMIN_CONSOLE_API_BASE,
  USER_MANAGEMENT_API,
  resolveAdobeEmbedPageUrl,
};
