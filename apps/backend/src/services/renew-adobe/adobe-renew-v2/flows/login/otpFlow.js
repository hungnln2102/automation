const logger = require("../../../../../utils/logger");
const { fetchOtpBySource, normalizeOtpSource } = require("../../../../otpProviderService");
const { LOGIN_TIMEOUTS } = require("./loginTimeouts");

function maskOtp(code) {
  const normalized = String(code || "").replace(/\D/g, "");
  if (!normalized) return "";
  if (normalized.length <= 2) return `${normalized[0] || "*"}*`;
  return `${normalized.slice(0, 2)}***`;
}

async function detectLoginScreen(page, timeoutMs = LOGIN_TIMEOUTS.SCREEN_DETECT_MS, isOnAdobeSite) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof isOnAdobeSite === "function" && isOnAdobeSite(page.url())) return "done";
    const screen = await page
      .evaluate(() => {
        for (const el of document.querySelectorAll("h1, h2, h3, [class*='Heading']")) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const t = (el.textContent || "").trim().toLowerCase();
          if (/verify|identity|verification|xác minh/.test(t)) return "2fa";
          if (/password|mật khẩu/.test(t)) return "password";
          if (/enter your email|sign in|đăng nhập/.test(t)) return "email";
        }
        return null;
      })
      .catch(() => null);
    if (screen === "2fa" || screen === "password" || screen === "email") return screen;
    const pwVisible = await page.locator('input[type="password"]:visible').first().isVisible().catch(() => false);
    if (pwVisible) return "password";
    await page.waitForTimeout(1000);
  }
  return "unknown";
}

async function fillOtpInputs(page, code) {
  const codeStr = String(code || "").replace(/\D/g, "").slice(0, 8);
  if (!codeStr) return false;

  const otpInput = page
    .locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[maxlength="1"]')
    .first();

  const multi = (await page.locator('input[maxlength="1"]').count().catch(() => 0)) >= 4;
  if (multi) {
    const digits = codeStr.split("").slice(0, 8);
    const inputs = await page.locator('input[maxlength="1"], input[inputmode="numeric"]').all();
    for (let i = 0; i < digits.length && i < inputs.length; i += 1) {
      await inputs[i].fill(digits[i]);
    }
    return true;
  }

  await otpInput.fill(codeStr);
  return true;
}

async function handleOtpChallenge(page, otpOptions = {}, { stage = "unknown" } = {}) {
  const challengeStartedAt = Date.now();
  await page.waitForTimeout(LOGIN_TIMEOUTS.OTP_INITIAL_WAIT_MS);
  await page
    .locator('[data-id="Page-PrimaryButton"], button:has-text("Continue")')
    .first()
    .click({ timeout: LOGIN_TIMEOUTS.OTP_CONTINUE_CLICK_TIMEOUT_MS })
    .catch(() => {});
  await page.waitForTimeout(LOGIN_TIMEOUTS.OTP_POLL_INTERVAL_MS);

  const normalizedSource = normalizeOtpSource(otpOptions.otpSource, {
    hasMailBackupId: Number.isFinite(Number(otpOptions.mailBackupId)),
  });
  logger.info(
    "[adobe-v2] OTP stage=%s: source=%s account=%s",
    stage,
    normalizedSource,
    String(otpOptions.accountEmail || "").slice(0, 80)
  );

  const maxAttempts = Math.max(
    6,
    Math.floor(LOGIN_TIMEOUTS.OTP_TOTAL_WAIT_MS / LOGIN_TIMEOUTS.OTP_POLL_INTERVAL_MS)
  );

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await page.waitForTimeout(LOGIN_TIMEOUTS.OTP_POLL_INTERVAL_MS);
    }
    if ((page.url() || "").includes("@AdobeOrg")) return;

    const code = await fetchOtpBySource({
      otpSource: normalizedSource,
      mailBackupId: otpOptions.mailBackupId,
      accountEmail: otpOptions.accountEmail,
      senderFilter: "adobe",
      minTimestampMs: challengeStartedAt - 15000,
    });

    if (!code) continue;

    await fillOtpInputs(page, code);
    logger.info("[adobe-v2] OTP stage=%s: đã điền OTP=%s", stage, maskOtp(code));

    await page.waitForTimeout(LOGIN_TIMEOUTS.SMALL_WAIT_MS);
    await page
      .locator('[data-id="Page-PrimaryButton"], button[type="submit"]')
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
    await page.waitForTimeout(LOGIN_TIMEOUTS.LARGE_WAIT_MS);
    return;
  }

  throw new Error("Hết thời gian chờ OTP.");
}

async function runOtpIfPresent(page, otpOptions = {}, { stage = "after-email", isOnAdobeSite } = {}) {
  const isAfterPassword = stage === "after-password";
  const detectTimeoutMs = isAfterPassword
    ? Math.min(
        LOGIN_TIMEOUTS.SCREEN_DETECT_MS,
        LOGIN_TIMEOUTS.AFTER_PASSWORD_OTP_DETECT_MS
      )
    : LOGIN_TIMEOUTS.SCREEN_DETECT_MS;
  let screen = await detectLoginScreen(
    page,
    detectTimeoutMs,
    isOnAdobeSite
  );
  if (screen !== "2fa" && !isAfterPassword) {
    // Một số màn Adobe render challenge OTP trễ sau redirect/submit.
    await page.waitForTimeout(LOGIN_TIMEOUTS.SCREEN_RECHECK_WAIT_MS);
    screen = await detectLoginScreen(
      page,
      LOGIN_TIMEOUTS.SCREEN_DETECT_MS,
      isOnAdobeSite
    );
  }

  if (screen !== "2fa") {
    logger.info("[adobe-v2] OTP stage=%s: không có challenge OTP", stage);
    return;
  }

  logger.info("[adobe-v2] OTP stage=%s: phát hiện challenge, bắt đầu lấy OTP", stage);
  await handleOtpChallenge(page, otpOptions, { stage });
}

module.exports = {
  detectLoginScreen,
  handleOtpChallenge,
  runOtpIfPresent,
};
