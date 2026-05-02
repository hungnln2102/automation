/**
 * Adobe Renew V2 — Luồng đăng nhập B2→B9.
 * Từ click Sign in đến khi tới trang đích (account/adminconsole).
 */

const logger = require("../../../utils/logger");
const { LOGIN_PAGE_URL, AUTH_SERVICES_BASE } = require("./shared/constants");
const { LOGIN_TIMEOUTS, runOtpIfPresent, runCredentialsFixedOnce, handleOtpChallenge } = require("./flows/login");

const SKIP_RE = /^\s*(not now|skip|bỏ qua|later|skip for now)\s*$/i;

/** True nếu URL là trang đã đăng nhập (account, adminconsole, home...), không phải form login. */
function isOnAdobeSite(url) {
  const u = (url || "").toLowerCase();
  if (!u) return false;
  if (u.includes("auth.services.adobe.com") || u.includes("auth.services")) return false;
  if (u.includes("@adobeorg")) return true;
  if (u.includes("adminconsole.adobe.com")) return true;
  if (u.includes("account.adobe.com")) return true;
  if (u.includes("www.adobe.com")) return true;
  if (u.includes("experience.adobe.com")) return true;
  if (u.includes("adobelogin.com") && !u.includes("/signin") && !u.includes("/index.html")) return true;
  if (u.includes("adobe.com") && !u.includes("auth.")) return true;
  return false;
}

async function buildAuthFailureSummary(page, contextLabel) {
  const u = page.url ? (page.url() || "") : "";
  const body = await page
    .evaluate(() => (document.body && document.body.innerText) ? document.body.innerText.slice(0, 900) : "")
    .catch(() => "");
  const normalized = body.replace(/\s+/g, " ").slice(0, 280);
  let reason = "Không xác định nguyên nhân trên auth page.";
  const lower = normalized.toLowerCase();
  if (/offline|check your internet/.test(lower)) {
    reason = "Adobe auth báo offline/network.";
  } else if (/no account associated/.test(lower)) {
    reason = "Adobe auth báo email không tồn tại/không liên kết.";
  } else if (/too many requests|rate limit|try again later/.test(lower)) {
    reason = "Adobe auth báo rate-limit.";
  }
  return `${contextLabel} ${reason} url=${u.slice(0, 160)} body=${normalized}`;
}

async function runLoginStep(stepName, handler) {
  logger.info("[adobe-v2] Login step start: %s", stepName);
  try {
    await handler();
    logger.info("[adobe-v2] Login step done: %s", stepName);
  } catch (error) {
    logger.error("[adobe-v2] Login step failed (%s): %s", stepName, error.message);
    throw error;
  }
}

async function maybeSkipSecurityPrompt(page) {
  if (!/progressive-profile|user-security/i.test(page.url())) return;
  await page
    .getByRole("button", { name: /skip/i })
    .click({ timeout: LOGIN_TIMEOUTS.SECURITY_SKIP_CLICK_TIMEOUT_MS })
    .catch(() => {});
  await page.waitForTimeout(LOGIN_TIMEOUTS.PROFILE_ACTION_WAIT_MS);
}

async function chooseNonPersonalProfileIfPresent(page, otpOptions = {}) {
  const chosenOrgName = await page
    .evaluate(() => {
      const text = (document.body?.innerText || "").toLowerCase();
      const hasChooser =
        /select a profile to sign in/.test(text) ||
        !!document.querySelector(".PP-ProfileChooser, [data-id*='PP-ProfileChooser']");
      if (!hasChooser) return null;

      const readName = (btn) => {
        const fromType =
          btn.querySelector(".Profile-Type--text-big")?.textContent ||
          btn.querySelector('[data-id="Profile-Type"]')?.textContent ||
          "";
        const fromEmail =
          btn.querySelector('[data-id="Profile-Email"]')?.textContent || "";
        const name = (fromType || fromEmail || btn.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        return name || null;
      };

      const isPersonal = (name, dataId) =>
        /personal profile/i.test(name || "") ||
        /authaccount/i.test(dataId || "");

      const buttons = Array.from(
        document.querySelectorAll("button.ActionList-Item, button[data-id*='PP-ProfileChooser']")
      );
      if (buttons.length === 0) return null;

      for (const btn of buttons) {
        const dataId = btn.getAttribute("data-id") || "";
        const name = readName(btn);
        if (isPersonal(name, dataId)) continue;
        btn.click();
        return name;
      }
      return null;
    })
    .catch(() => null);

  if (!chosenOrgName) return null;

  otpOptions.selectedOrgName = String(chosenOrgName).trim();
  logger.info(
    "[adobe-v2] progressive-profile: selected non-personal profile = %s",
    otpOptions.selectedOrgName
  );
  await page.waitForTimeout(LOGIN_TIMEOUTS.PROFILE_ACTION_WAIT_MS);
  return otpOptions.selectedOrgName;
}

async function clickNotNowIfPresent(page) {
  const candidates = [
    () => page.getByRole("button", { name: /not now|skip|later|bỏ qua/i }).first().click({ timeout: 2500 }),
    () => page.locator('button:has-text("Not now"), button:has-text("Skip"), button:has-text("Later")').first().click({ timeout: 2500 }),
    () => page.locator('[data-id*="skip"], [data-id*="not-now"], [data-id*="later"]').first().click({ timeout: 2500 }),
  ];
  for (const attempt of candidates) {
    try {
      await attempt();
      await page.waitForTimeout(LOGIN_TIMEOUTS.PROFILE_ACTION_WAIT_MS);
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

async function handleProgressiveProfile(page, otpOptions = {}) {
  for (let r = 0; r < 6; r++) {
    if (isOnAdobeSite(page.url())) return;
    if (await chooseNonPersonalProfileIfPresent(page, otpOptions)) continue;
    if (await clickNotNowIfPresent(page)) continue;
    const isVerify = await page.evaluate(() => /verify|identity|verification|xác minh/i.test(document.body?.innerText || "")).catch(() => false);
    if (isVerify) {
      await handleOtpChallenge(page, otpOptions, { stage: "progressive-profile" });
      await page.waitForTimeout(LOGIN_TIMEOUTS.PROFILE_OTP_WAIT_MS);
      continue;
    }
    const isPhone = await page.evaluate(() => /phone|số điện thoại|mobile/i.test(document.body?.innerText || "") && /verify|add/i.test(document.body?.innerText || "")).catch(() => false);
    if (isPhone) {
      await clickNotNowIfPresent(page);
      continue;
    }
    break;
  }
}

/**
 * Form login khi đã ở trang auth (auth.services / adobelogin). Dùng cho B14 hoặc flow standalone.
 * Nhập email → detectScreen → 2FA/password → skip/progressive → chờ redirect tới Admin Console.
 */
async function doFormLoginOnAuthPage(page, email, password, otpOptions = {}) {
  try {
    await page
      .waitForURL(/auth\.services\.adobe\.com|adobelogin\.com/, {
        timeout: LOGIN_TIMEOUTS.AUTH_PAGE_WAIT_MS,
      })
      .catch(() => {});
    await runLoginStep("credentials-fixed-once", async () => {
      await runCredentialsFixedOnce(page, email, password, otpOptions, {
        isOnAdobeSite,
      });
    });
    await runLoginStep("otp-after-password", async () => {
      await runOtpIfPresent(page, otpOptions, {
        stage: "after-password",
        isOnAdobeSite,
      });
    });
    await runLoginStep("progressive-profile", async () => {
      await maybeSkipSecurityPrompt(page);
      await handleProgressiveProfile(page, otpOptions);
    });

    await page.waitForFunction(
      () => {
        const h = window.location.href;
        return h.includes("@AdobeOrg") || (/^https?:\/\/([a-z0-9-]+\.)*adobe\.com/i.test(h) && !h.includes("auth.services"));
      },
      { timeout: LOGIN_TIMEOUTS.FINAL_REDIRECT_WAIT_MS }
    ).catch(() => {});
    await page.waitForTimeout(LOGIN_TIMEOUTS.LARGE_WAIT_MS);
    const ok = isOnAdobeSite(page.url());
    if (!ok) {
      const u = page.url() || "";
      const body = await page.evaluate(() => (document.body && document.body.innerText) ? document.body.innerText.slice(0, 800) : "").catch(() => "");
      logger.warn("[adobe-v2] doFormLoginOnAuthPage chưa tới trang đích. url=%s body=%s", u.slice(0, 160), body.replace(/\s+/g, " ").slice(0, 260));
    }
    return ok;
  } catch (e) {
    const u = page.url ? (page.url() || "") : "";
    const body = await page.evaluate(() => (document.body && document.body.innerText) ? document.body.innerText.slice(0, 800) : "").catch(() => "");
    logger.error("[adobe-v2] doFormLoginOnAuthPage error: %s url=%s body=%s",
      e.message, u.slice(0, 160), body.replace(/\s+/g, " ").slice(0, 260));
    return false;
  }
}

/**
 * Chạy luồng đăng nhập B2→B9. Giả định: đang ở adobe.com, chưa đăng nhập, có nút Sign in.
 * Sau khi gọi xong, page sẽ ở trang đích (account/adminconsole).
 * @param {import('playwright').Page} page
 * @param {{ email: string, password: string, mailBackupId?: number, otpSource?: string }} opts
 */
async function runLoginFlow(page, opts) {
  const { email, password, mailBackupId = null, otpSource = "imap" } = opts;
  const otpOptions = { mailBackupId, otpSource, accountEmail: email };

  // Nếu đã ở trang auth (fallback từ B1 khi adobe.com lỗi HTTP2), login trực tiếp không cần click Sign in.
  const currentUrl = page.url() || "";
  logger.info("[adobe-v2] runLoginFlow start url=%s", currentUrl.slice(0, 140));

  // Nếu rơi vào chrome error page (thường do network/proxy), retry điều hướng về auth page.
  if (/^chrome-error:\/\//i.test(currentUrl)) {
    logger.warn("[adobe-v2] Đang ở chrome-error page → retry goto LOGIN_PAGE_URL");
    await page.goto(LOGIN_PAGE_URL, {
      waitUntil: "domcontentloaded",
      timeout: LOGIN_TIMEOUTS.RETRY_GOTO_TIMEOUT_MS,
    }).catch((e) => {
      logger.warn("[adobe-v2] retry goto LOGIN_PAGE_URL failed: %s", e.message);
    });
    await page.waitForTimeout(LOGIN_TIMEOUTS.MEDIUM_WAIT_MS);
  }

  const urlAfterRetry = page.url() || "";
  if (/^chrome-error:\/\//i.test(urlAfterRetry)) {
    throw new Error("Không mở được trang login (chrome-error). Kiểm tra mạng/proxy/DNS trên VPS.");
  }

  if (/auth\.services\.adobe\.com|adobelogin\.com/i.test(urlAfterRetry)) {
    logger.info("[adobe-v2] B2: Đang ở auth page (%s) → login trực tiếp", urlAfterRetry.slice(0, 90));
    const ok = await doFormLoginOnAuthPage(page, email, password, otpOptions);
    if (!ok) {
      throw new Error(await buildAuthFailureSummary(page, "Login thất bại trên trang auth (fallback)."));
    }
    return { selectedOrgName: otpOptions.selectedOrgName || null };
  }

  // Admin Console là SPA — session hết hạn có thể chậm render form hoặc nút Sign in.
  if (/adminconsole\.adobe\.com/i.test(urlAfterRetry) && !urlAfterRetry.includes("@AdobeOrg")) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    for (let w = 0; w < 8; w++) {
      const u = page.url() || "";
      if (/auth\.services|adobelogin/i.test(u)) break;
      const hasEmail = await page
        .locator('input[name="username"], input[type="email"], input[name="email"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (hasEmail) break;
      await page.waitForTimeout(LOGIN_TIMEOUTS.SPA_DETECT_INTERVAL_MS);
    }
  }

  const urlAfterWait = page.url() || "";
  if (/auth\.services\.adobe\.com|adobelogin\.com/i.test(urlAfterWait)) {
    logger.info("[adobe-v2] B2: Sau chờ SPA → auth page (%s) → login trực tiếp", urlAfterWait.slice(0, 90));
    const ok = await doFormLoginOnAuthPage(page, email, password, otpOptions);
    if (!ok) {
      throw new Error(await buildAuthFailureSummary(page, "Login thất bại trên trang auth (sau chờ SPA)."));
    }
    return { selectedOrgName: otpOptions.selectedOrgName || null };
  }

  // Fallback: một số môi trường headless redirect ra trang có form login nhưng URL chưa match auth.* (hoặc bị custom domain).
  // Nếu thấy input email thì login trực tiếp, không cần click Sign in.
  const emailInputVisible = await page
    .locator('input[name="username"], input[type="email"], input[name="email"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (emailInputVisible) {
    logger.info("[adobe-v2] B2: Thấy form login (email input) → login trực tiếp, url=%s", (page.url() || "").slice(0, 90));
    const ok = await doFormLoginOnAuthPage(page, email, password, otpOptions);
    if (!ok) {
      throw new Error(await buildAuthFailureSummary(page, "Login thất bại trên trang form login (fallback)."));
    }
    return { selectedOrgName: otpOptions.selectedOrgName || null };
  }

  // ─── B2: Sign in (nhiều biến thể UI Adobe / locale) ───
  logger.info("[adobe-v2] B2: Click Sign in");
  const signInAttempts = [
    () => page.locator("button.profile-comp.secondary-button").first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () => page.getByRole("link", { name: /sign\s*in/i }).first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () => page.getByRole("button", { name: /sign\s*in/i }).first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () => page.getByRole("button", { name: /đăng nhập/i }).first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () => page.getByRole("link", { name: /đăng nhập/i }).first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () => page.locator('a[href*="adobelogin.com"], a[href*="ims-na1.adobelogin"]').first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () => page.locator('a[href*="auth.services.adobe"]').first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () => page.locator('button:has-text("Sign in")').first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () => page.locator('a:has-text("Sign in")').first().click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
    () =>
      page
        .locator('[data-testid*="sign"][role="button"], [aria-label*="Sign in"], [aria-label*="sign in"]')
        .first()
        .click({ timeout: LOGIN_TIMEOUTS.SIGN_IN_CLICK_TIMEOUT_MS }),
  ];

  let signInClicked = false;
  for (const attempt of signInAttempts) {
    try {
      await attempt();
      signInClicked = true;
      break;
    } catch {
      /* thử selector tiếp */
    }
  }

  if (!signInClicked && /adminconsole\.adobe\.com/i.test(page.url() || "")) {
    logger.warn(
      "[adobe-v2] B2: Không thấy nút Sign in trên adminconsole → goto auth.services (fallback IMS)"
    );
    await page
      .goto(`${AUTH_SERVICES_BASE}/en_US/index.html`, {
        waitUntil: "domcontentloaded",
        timeout: LOGIN_TIMEOUTS.RETRY_GOTO_TIMEOUT_MS,
      })
      .catch((e) => logger.warn("[adobe-v2] B2 goto auth.services: %s", e.message));
    await page.waitForTimeout(LOGIN_TIMEOUTS.PROFILE_ACTION_WAIT_MS);
    const ok = await doFormLoginOnAuthPage(page, email, password, otpOptions);
    if (ok) return;
    throw new Error(await buildAuthFailureSummary(page, "Login thất bại sau fallback IMS."));
  }

  if (!signInClicked) {
    throw new Error(`Không tìm thấy nút Sign in. URL hiện tại: ${(page.url() || "").slice(0, 140)}`);
  }
  await page
    .waitForURL(/auth\.services\.adobe\.com|adobelogin\.com|account\.adobe\.com|adminconsole\.adobe\.com/, {
      timeout: LOGIN_TIMEOUTS.AUTH_REDIRECT_WAIT_MS,
    })
    .catch(() => {});

  const urlAfterSignIn = page.url();
  if (!urlAfterSignIn.includes("auth.services") && !urlAfterSignIn.includes("adobelogin")) {
    logger.info("[adobe-v2] Sau B2 đã đăng nhập (cookie còn hiệu lực), url=%s", urlAfterSignIn.slice(0, 80));
    await page.waitForTimeout(LOGIN_TIMEOUTS.PROFILE_ACTION_WAIT_MS);
    return { selectedOrgName: otpOptions.selectedOrgName || null };
  }

  await runLoginStep("credentials-fixed-once", async () => {
    await runCredentialsFixedOnce(page, email, password, otpOptions, {
      isOnAdobeSite,
    });
  });
  await runLoginStep("otp-after-password", async () => {
    await runOtpIfPresent(page, otpOptions, {
      stage: "after-password",
      isOnAdobeSite,
    });
  });
  await runLoginStep("progressive-profile", async () => {
    await maybeSkipSecurityPrompt(page);
    await handleProgressiveProfile(page, otpOptions);
  });

  // ─── B9: Xác nhận đã tới adminconsole ───
  // Adobe tự redirect sau login — enterPassword() đã waitForURL(adminconsole) rồi.
  // handleProgressiveProfile() đã xử lý các prompt phụ (backup email, phone, 2FA).
  // Chỉ cần kiểm tra URL cuối để đảm bảo login thành công.
  const finalUrl = page.url();
  logger.info("[adobe-v2] B9: url sau login = %s", finalUrl.slice(0, 100));
  if (!isOnAdobeSite(finalUrl)) {
    throw new Error(`Login chưa hoàn tất sau B9. URL hiện tại: ${finalUrl.slice(0, 120)}`);
  }
  await page.waitForTimeout(LOGIN_TIMEOUTS.FINAL_STABILIZE_WAIT_MS);
  return { selectedOrgName: otpOptions.selectedOrgName || null };
}

module.exports = {
  runLoginFlow,
  isOnAdobeSite,
  doFormLoginOnAuthPage,
};
