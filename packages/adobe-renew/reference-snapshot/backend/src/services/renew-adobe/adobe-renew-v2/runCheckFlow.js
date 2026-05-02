/**
 * Adobe Renew V2 — Điều phối luồng B1–B13.
 * B1 tại đây; B2–B9 giao loginFlow.js; B10–B13 giao checkInfoFlow.js.
 */

const logger = require("../../../utils/logger");
const { getPlaywrightProxyOptions } = require("./shared/proxyConfig");
const { FLOW_ERROR_CODES } = require("./shared/errorCodes");
const { runLoginFlow } = require("./loginFlow");
const { runB10ToB13 } = require("./checkInfoFlow");
const { launchSessionFromProfile } = require("./shared/profileSession");
const {
  DEFAULT_COOKIE_EXPIRY_DAYS,
  gotoAdobeAdminConsoleB1,
  toPwCookies,
  fromPwCookies,
  buildSuccessResult,
  detectSessionValid,
} = require("./runCheckFlow.helpers");

function mapRunCheckErrorCode(error) {
  const msg = String(error?.message || "").toLowerCase();
  if (msg.includes("timeout")) return FLOW_ERROR_CODES.TIMEOUT;
  if (msg.includes("otp")) return FLOW_ERROR_CODES.OTP_NOT_FOUND;
  if (msg.includes("redirect")) return FLOW_ERROR_CODES.REDIRECT_INVALID;
  if (msg.includes("session")) return FLOW_ERROR_CODES.SESSION_EXPIRED;
  if (msg.includes("navigation") || msg.includes("target closed")) {
    return FLOW_ERROR_CODES.NAVIGATION_FAILED;
  }
  return FLOW_ERROR_CODES.UNKNOWN;
}

/**
 * Chạy toàn bộ luồng B1–B13.
 * Nếu options.sharedSession = { context, page } thì dùng browser có sẵn (B14 có thể dùng tiếp), không đóng browser.
 * @param {string} email - Email đăng nhập Adobe
 * @param {string} password - Mật khẩu
 * @param {{ savedCookies?: any[], mailBackupId?: number, otpSource?: string, sharedSession?: { context: import('playwright').BrowserContext, page: import('playwright').Page }, existingOrgName?: string, cachedContractActiveLicenseCount?: number|null, forceProductCheck?: boolean, onlyLogin?: boolean, pinnedCcpProductIds?: string[] }} options - existingOrgName: bỏ qua B10–B11; onlyLogin: chỉ B1–B9 (login), không chạy B10–B13 (check org/products/users). pinnedCcpProductIds: id CCP đã lưu trong DB cho admin này.
 * @returns {Promise<{ success: boolean, error?: string, org_name?: string, license_status?: string, products?: any[], users?: any[], cookies?: any[] }>}
 */
async function runCheckFlow(email, password, options = {}) {
  logger.info("[adobe-v2] runCheckFlow BẮT ĐẦU (cookie expiry=%d ngày) — adobe-renew-v2", DEFAULT_COOKIE_EXPIRY_DAYS);
  const {
    savedCookies = [],
    mailBackupId = null,
    otpSource = "imap",
    sharedSession = null,
    existingOrgName = null,
    cachedContractActiveLicenseCount = null,
    forceProductCheck = false,
    onlyLogin = false,
    pinnedCcpProductIds = [],
  } = options;
  let ownedContext = null;
  let context;
  let page;

  if (sharedSession && sharedSession.context && sharedSession.page) {
    context = sharedSession.context;
    page = sharedSession.page;
    logger.info("[adobe-v2] B14: Dùng shared session (không đóng browser)");
  } else {
    const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
    const proxyOptions = getPlaywrightProxyOptions();
    if (proxyOptions) logger.info("[adobe-v2] Proxy: %s", proxyOptions.server);

    const skipPersistentProfile =
      String(process.env.ADOBE_V2_SKIP_PERSISTENT_PROFILE || "").trim() === "1";

    const launchEphemeralContext = async () => {
      const { chromium } = require("playwright");
      const launchOptions = {
        headless,
        slowMo: headless ? 0 : 80,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-quic",
        ],
      };
      if (proxyOptions) launchOptions.proxy = proxyOptions;
      const browser = await chromium.launch(launchOptions);
      const ctx = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 720 },
      });
      const pg = await ctx.newPage();
      return { context: ctx, page: pg };
    };

    if (skipPersistentProfile) {
      logger.info(
        "[adobe-v2] ADOBE_V2_SKIP_PERSISTENT_PROFILE=1 — bỏ qua profile local, dùng ephemeral context"
      );
      const ep = await launchEphemeralContext();
      context = ep.context;
      page = ep.page;
      ownedContext = context;
    } else {
      try {
        const prof = await launchSessionFromProfile({
          adminEmail: email,
          headless,
          proxyOptions,
        });
        context = prof.context;
        page = prof.page;
        ownedContext = context;
      } catch (profileErr) {
        logger.warn(
          "[adobe-v2] profile-session launch failed, fallback to normal context: %s",
          profileErr.message
        );
        const ep = await launchEphemeralContext();
        context = ep.context;
        page = ep.page;
        ownedContext = context;
      }
    }
  }

  try {
    const hasSavedCookies = savedCookies.length > 0;
    const pwCookies = hasSavedCookies ? toPwCookies(savedCookies) : [];
    const hasUsableCookies = pwCookies.length > 0;

    if (hasSavedCookies && hasUsableCookies) {
      await context.addCookies(pwCookies);
      logger.info(
        "[adobe-v2] Cookie lifecycle: có %d cookie còn hạn, thử reuse session",
        pwCookies.length
      );
    } else if (hasSavedCookies && !hasUsableCookies) {
      logger.info(
        "[adobe-v2] Cookie lifecycle: có cookie nhưng đã hết hạn/không dùng được → login lại"
      );
    } else {
      logger.info("[adobe-v2] Cookie lifecycle: chưa có cookie → gọi luồng login");
    }

    // ─── B1: Đi thẳng vào Admin Console entry ───
    // Adobe tự redirect adminconsole.adobe.com → auth.services.adobe.com khi chưa login.
    page = await gotoAdobeAdminConsoleB1(page, context, sharedSession || null);
    // Sau khi goto, Adobe có thể redirect sang auth mất vài giây.
    // ADOBE_V2_B1_STABILIZE_MS (mặc định 5000): tùy môi trường có thể hạ (vd. 2500) nếu ổn định.
    const b1StabilizeMs = (() => {
      const n = Number.parseInt(process.env.ADOBE_V2_B1_STABILIZE_MS || "", 10);
      return Number.isFinite(n) && n >= 0 && n <= 30000 ? n : 5000;
    })();
    if (b1StabilizeMs > 0) {
      await page.waitForTimeout(b1StabilizeMs);
    }
    await page.locator('button[aria-label="Close"], button[aria-label="close"], .dialog-close').first().click({ timeout: 3000 }).then(() => true).catch(() => false);

    if (!hasUsableCookies) {
      const loginMeta = await runLoginFlow(page, {
        email,
        password,
        mailBackupId,
        otpSource,
      });
      const resolvedOrgName =
        existingOrgName || loginMeta?.selectedOrgName || null;
      return buildSuccessResult({
        context,
        page,
        runB10ToB13,
        onlyLogin,
        existingOrgName: resolvedOrgName,
        cachedContractActiveLicenseCount,
        forceProductCheck,
        pinnedCcpProductIds,
        adminLoginEmail: email,
        cookieLogLabel: "Lưu cookies sau login mới",
        includeWithExpiry: false,
        onlyLoginLogLabel: "onlyLogin: login xong do thiếu/expired cookie",
      });
    }

    // ─── B2: Session check — tránh false positive ───
    // Adobe có thể show adminconsole shell trước rồi mới redirect sang auth.
    // Vì vậy không chỉ dựa vào URL; cần dựa thêm vào việc thấy màn login hay thấy org-switch.
    const urlAfterB1 = page.url();

    // Không dùng URL làm tiêu chí duy nhất.
    // Adobe có thể show shell adminconsole trước, rồi mới chuyển sang auth,
    // nên nếu check quá sớm sẽ bị false positive.
    const sessionValid = await detectSessionValid(page, 5000);

    logger.info(
      "[adobe-v2] B2: url=%s → session %s",
      urlAfterB1.slice(0, 90),
      sessionValid ? "VALID (bỏ qua login)" : "EXPIRED (cần login)"
    );

    if (sessionValid) {
      return buildSuccessResult({
        context,
        page,
        runB10ToB13,
        onlyLogin,
        existingOrgName,
        cachedContractActiveLicenseCount,
        forceProductCheck,
        pinnedCcpProductIds,
        adminLoginEmail: email,
        cookieLogLabel: "Lưu cookies",
        includeWithExpiry: false,
        onlyLoginLogLabel:
          "onlyLogin: session còn hiệu lực, dừng trước B10–B13",
      });
    }

    // Session hết hạn → B3–B9 (loginFlow) rồi B10–B13
    const loginMeta = await runLoginFlow(page, {
      email,
      password,
      mailBackupId,
      otpSource,
    });
    const resolvedOrgName =
      existingOrgName || loginMeta?.selectedOrgName || null;
    return buildSuccessResult({
      context,
      page,
      runB10ToB13,
      onlyLogin,
      existingOrgName: resolvedOrgName,
      cachedContractActiveLicenseCount,
      forceProductCheck,
      pinnedCcpProductIds,
      adminLoginEmail: email,
      cookieLogLabel: "Lưu cookies",
      includeWithExpiry: true,
      onlyLoginLogLabel:
        "onlyLogin: dừng sau B9 (login xong), không chạy B10–B13",
    });

  } catch (err) {
    logger.error("[adobe-v2] runCheckFlow error: %s", err.message);
    return {
      success: false,
      error: err.message,
      errorCode: mapRunCheckErrorCode(err),
    };
  } finally {
    if (ownedContext) await ownedContext.close().catch(() => {});
  }
}

module.exports = {
  runCheckFlow,
  toPwCookies,
  fromPwCookies,
};
