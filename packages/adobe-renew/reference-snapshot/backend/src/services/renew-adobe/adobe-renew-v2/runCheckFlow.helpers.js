const logger = require("../../../utils/logger");
const { ADMIN_CONSOLE_BASE } = require("./shared/constants");
const {
  DEFAULT_COOKIE_EXPIRY_DAYS,
  toPwCookies,
  fromPwCookies,
  exportCookies,
  detectSessionValid,
} = require("./flows/login/sessionFlow");

function resolveAdobeEntryUrl() {
  const raw = String(process.env.ADOBE_ENTRY_URL || "").trim();
  if (!raw) {
    return ADMIN_CONSOLE_BASE || "https://adminconsole.adobe.com/";
  }
  if (!/^https:\/\//i.test(raw)) {
    logger.warn(
      "[adobe-v2] ADOBE_ENTRY_URL không hợp lệ (phải bắt đầu bằng https://): %s",
      raw
    );
    return ADMIN_CONSOLE_BASE || "https://adminconsole.adobe.com/";
  }
  return raw;
}

/** Lỗi CDP kiểu "Object with guid response@... was not bound" — thường hết sau khi đóng tab và mở tab mới trong cùng context. */
function isNavigationRecoverablePlaywrightError(message) {
  const m = (message || "").toString();
  return (
    m.includes("was not bound") ||
    m.includes("Target page, context or browser has been closed") ||
    m.includes("Target closed") ||
    m.includes("Execution context was destroyed") ||
    m.includes("Protocol error")
  );
}

/**
 * B1: goto admin console entry, có retry khi Playwright mất sync CDP với Response/navigation.
 * @param {import('playwright').Page} initialPage
 * @param {import('playwright').BrowserContext} context
 * @param {{ page: import('playwright').Page, context?: import('playwright').BrowserContext }|null} sharedSession - mutate .page nếu tạo tab mới
 * @returns {Promise<import('playwright').Page>}
 */
async function gotoAdobeAdminConsoleB1(initialPage, context, sharedSession) {
  const maxAttempts = 3;
  let current = initialPage;
  const adobeEntryUrl = resolveAdobeEntryUrl();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(
        "[adobe-v2] B1: goto Adobe entry=%s (attempt %d)",
        adobeEntryUrl,
        attempt
      );
      await current.goto(adobeEntryUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      return current;
    } catch (e) {
      const msg = e.message || String(e);
      logger.warn("[adobe-v2] B1 goto error (attempt %d): %s", attempt, msg);

      const canRetry =
        attempt < maxAttempts &&
        context &&
        isNavigationRecoverablePlaywrightError(msg);
      if (!canRetry) throw e;

      const newPage = await context.newPage();
      await current.close().catch(() => {});
      current = newPage;
      if (sharedSession) {
        sharedSession.page = newPage;
      }
    }
  }

  throw new Error("B1: goto ADMIN_CONSOLE failed after retries");
}

async function buildSuccessResult({
  context,
  page,
  runB10ToB13,
  onlyLogin = false,
  existingOrgName = null,
  cachedContractActiveLicenseCount = null,
  forceProductCheck = false,
  pinnedCcpProductIds = [],
  adminLoginEmail = null,
  cookieLogLabel = "Lưu cookies",
  includeWithExpiry = false,
  onlyLoginLogLabel = "onlyLogin: dừng sau login",
}) {
  const { cookies, withExpiry } = await exportCookies(context, {
    includeWithExpiry,
  });

  if (onlyLogin) {
    logger.info("[adobe-v2] %s", onlyLoginLogLabel);
    return { success: true, cookies };
  }

  const result = await runB10ToB13(page, {
    existingOrgName,
    cachedContractActiveLicenseCount,
    forceProductCheck,
    pinnedCcpProductIds,
    adminLoginEmail,
  });
  if (includeWithExpiry) {
    logger.info(
      "[adobe-v2] %s: %d (expiry %d ngày, %d có expirationDate)",
      cookieLogLabel,
      cookies.length,
      DEFAULT_COOKIE_EXPIRY_DAYS,
      withExpiry ?? 0
    );
  } else {
    logger.info(
      "[adobe-v2] %s: %d (expiry %d ngày)",
      cookieLogLabel,
      cookies.length,
      DEFAULT_COOKIE_EXPIRY_DAYS
    );
  }
  return { success: true, ...result, cookies };
}

module.exports = {
  DEFAULT_COOKIE_EXPIRY_DAYS,
  gotoAdobeAdminConsoleB1,
  toPwCookies,
  fromPwCookies,
  buildSuccessResult,
  detectSessionValid,
};
