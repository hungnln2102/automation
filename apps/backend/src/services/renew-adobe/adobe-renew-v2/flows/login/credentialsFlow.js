const logger = require("../../../../../utils/logger");
const { LOGIN_TIMEOUTS } = require("./loginTimeouts");
const { detectLoginScreen, runOtpIfPresent } = require("./otpFlow");

const PASSWORD_SELECTORS = [
  'input[name="password"]:visible',
  'input[type="password"]:visible',
  'input#password:visible',
  'input#i0118:visible',
  'input[name="passwd"]:visible',
];

const PASSWORD_SUBMIT_SELECTORS = [
  '[data-id="Page-PrimaryButton"]',
  'button[type="submit"]',
  '#idSIButton9',
  'input[type="submit"]',
  'button:has-text("Continue")',
  'button:has-text("Sign in")',
];

async function getAuthPageErrorReason(page, { skipPasswordErrorIfFieldEmpty = false } = {}) {
  const result = await page
    .evaluate(() => {
      const text = (document.body?.innerText || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!text) return null;
      if (/your computer seems to be offline|seems to be offline|please check your internet/.test(text)) {
        return "Adobe auth báo offline/network error.";
      }
      if (/no account associated with this email address|no account associated/.test(text)) {
        return "Adobe auth báo email không tồn tại/không liên kết account.";
      }
      if (/too many requests|rate limit|try again later/.test(text)) {
        return "Adobe auth báo giới hạn tần suất đăng nhập.";
      }
      if (/incorrect password|wrong password|that's an incorrect password/.test(text)) {
        return "__password_error__";
      }
      return null;
    })
    .catch(() => null);

  if (result === "__password_error__") {
    if (skipPasswordErrorIfFieldEmpty) {
      const pwVal = await page
        .locator('input[type="password"]:visible, input[name="password"]:visible, input#password:visible')
        .first()
        .inputValue()
        .catch(() => "");
      if (!pwVal) {
        logger.info("[adobe-v2] Bỏ qua lỗi password cũ (ô MK còn trống) — sẽ nhập lại");
        return null;
      }
    }
    return "Adobe auth báo mật khẩu sai — cập nhật cột password_encrypted (hoặc API cập nhật account) cho khớp Adobe ID.";
  }

  return result || null;
}

async function waitForEmailInput(page, timeoutMs = LOGIN_TIMEOUTS.EMAIL_INPUT_WAIT_MS) {
  const emailInput = page
    .locator('input[name="username"], input[type="email"], input[name="email"]')
    .first();
  await emailInput.waitFor({ state: "visible", timeout: timeoutMs });
  return emailInput;
}

async function isPasswordPageReady(page) {
  const url = page.url() || "";
  const onMsLogin = /login\.(live|microsoftonline)\.com/i.test(url);
  const passwordInput = page.locator(PASSWORD_SELECTORS.join(", ")).first();
  const visible = await passwordInput.isVisible().catch(() => false);
  if (!visible) return false;
  const enabled = await passwordInput.isEnabled().catch(() => false);
  if (!enabled) return false;
  const headingOk = await page
    .evaluate(() => {
      const t = (document.body?.innerText || "").toLowerCase();
      return /enter (your )?password|password|mật khẩu/.test(t);
    })
    .catch(() => false);
  return onMsLogin || headingOk;
}

/**
 * Sau OTP: delay cố định → chờ màn password (Microsoft/Hotmail hoặc Adobe) hiện lên → mới nhập MK.
 */
async function waitForPasswordPageAfterOtp(page) {
  logger.info(
    "[adobe-v2] OTP xong — delay %sms trước khi chờ màn password",
    LOGIN_TIMEOUTS.POST_OTP_BEFORE_PASSWORD_MS
  );
  await page.waitForTimeout(LOGIN_TIMEOUTS.POST_OTP_BEFORE_PASSWORD_MS);

  const passwordInput = page.locator(PASSWORD_SELECTORS.join(", ")).first();
  const deadline = Date.now() + LOGIN_TIMEOUTS.POST_OTP_PASSWORD_PAGE_WAIT_MS;

  while (Date.now() < deadline) {
    if (await isPasswordPageReady(page)) {
      await page.waitForTimeout(LOGIN_TIMEOUTS.PASSWORD_SCREEN_STABILIZE_MS);
      logger.info(
        "[adobe-v2] Màn password đã sẵn sàng (url=%s), bắt đầu nhập mật khẩu",
        (page.url() || "").slice(0, 100)
      );
      return passwordInput;
    }
    await page.waitForTimeout(400);
  }

  await passwordInput.waitFor({ state: "visible", timeout: 5000 });
  logger.warn("[adobe-v2] Màn password chưa xác nhận đủ, vẫn thử nhập (url=%s)", (page.url() || "").slice(0, 100));
  await page.waitForTimeout(LOGIN_TIMEOUTS.PASSWORD_SCREEN_STABILIZE_MS);
  return passwordInput;
}

async function waitForPasswordInputReady(page, timeoutMs = LOGIN_TIMEOUTS.PASSWORD_INPUT_WAIT_MS) {
  const passwordInput = page.locator(PASSWORD_SELECTORS.join(", ")).first();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const visible = await passwordInput.isVisible().catch(() => false);
    const enabled = visible ? await passwordInput.isEnabled().catch(() => false) : false;
    if (visible && enabled) {
      await page.waitForTimeout(LOGIN_TIMEOUTS.PASSWORD_SCREEN_STABILIZE_MS);
      const stillReady =
        (await passwordInput.isVisible().catch(() => false)) &&
        (await passwordInput.isEnabled().catch(() => false));
      if (stillReady) {
        return passwordInput;
      }
    }
    await page.waitForTimeout(300);
  }

  await passwordInput.waitFor({ state: "visible", timeout: 2000 });
  return passwordInput;
}

async function waitUntilPasswordEntered(passwordInput, password, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entered = await passwordInput.inputValue().catch(() => "");
    if (entered === password) {
      return true;
    }
    await passwordInput.page().waitForTimeout(150);
  }
  return false;
}

async function submitPasswordForm(page) {
  await page.waitForTimeout(LOGIN_TIMEOUTS.PASSWORD_SUBMIT_SETTLE_MS);
  const url = page.url() || "";
  const isMs = /login\.(live|microsoftonline)\.com/i.test(url);
  const selectors = isMs
    ? ["#idSIButton9", 'input[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Continue")']
    : PASSWORD_SUBMIT_SELECTORS;
  const submitBtn = page.locator(selectors.join(", ")).first();
  const hasBtn = await submitBtn.isVisible().catch(() => false);
  if (hasBtn) {
    await submitBtn.click({ timeout: 5000 });
    return;
  }
  await page.keyboard.press("Enter");
}

async function enterPassword(page, password, { afterOtp = false } = {}) {
  const passwordInput = afterOtp
    ? await waitForPasswordPageAfterOtp(page)
    : await waitForPasswordInputReady(page);
  await passwordInput.click();
  await passwordInput.fill("");
  await page.waitForTimeout(200);

  await passwordInput.pressSequentially(password, {
    delay: LOGIN_TIMEOUTS.PASSWORD_TYPE_DELAY_MS,
  });

  const enteredOk = await waitUntilPasswordEntered(passwordInput, password);
  if (!enteredOk) {
    logger.warn(
      "[adobe-v2] password sequential type mismatch (expectedLen=%s), retry fill",
      password.length
    );
    await passwordInput.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await passwordInput.fill("");
    await passwordInput.fill(password);
    await waitUntilPasswordEntered(passwordInput, password);
  }

  const finalValue = await passwordInput.inputValue().catch(() => "");
  if (finalValue !== password) {
    throw new Error(
      `Mật khẩu chưa nhập đủ trên form (enteredLen=${finalValue.length}, expectedLen=${password.length}) — không bấm Continue.`
    );
  }
  logger.info("[adobe-v2] password entered OK (len=%s), chờ trước khi submit", password.length);

  await submitPasswordForm(page);
  await page
    .waitForURL(
      (url) =>
        url.includes("@AdobeOrg") ||
        (url.includes("adminconsole.adobe.com") && !url.includes("auth.")) ||
        (url.includes("account.adobe.com") && !url.includes("auth.")),
      { timeout: LOGIN_TIMEOUTS.PASSWORD_URL_WAIT_MS }
    )
    .catch(() => {});
  await page.waitForTimeout(LOGIN_TIMEOUTS.LARGE_WAIT_MS);
}

async function resolvePostEmailState(
  page,
  { isOnAdobeSite, timeoutMs = LOGIN_TIMEOUTS.EMAIL_STEP_WAIT_MS } = {}
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof isOnAdobeSite === "function" && isOnAdobeSite(page.url())) {
      return "done";
    }

    const passwordVisible = await page
      .locator(PASSWORD_SELECTORS.join(", "))
      .first()
      .isVisible()
      .catch(() => false);
    if (passwordVisible) {
      return "password";
    }

    const screen = await detectLoginScreen(
      page,
      Math.min(3000, LOGIN_TIMEOUTS.SCREEN_DETECT_MS),
      isOnAdobeSite
    );
    if (screen === "2fa" || screen === "password" || screen === "done") {
      return screen;
    }

    await page.waitForTimeout(LOGIN_TIMEOUTS.SCREEN_RECHECK_WAIT_MS);
  }

  return "unknown";
}

/**
 * Bước cố định: email -> Enter -> OTP nếu có -> password -> Enter.
 */
async function runCredentialsFixedOnce(page, email, password, otpOptions = {}, { isOnAdobeSite } = {}) {
  const emailInput = await waitForEmailInput(page);
  await emailInput.fill(email);
  await page.waitForTimeout(LOGIN_TIMEOUTS.SMALL_WAIT_MS);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(LOGIN_TIMEOUTS.EMAIL_SUBMIT_SETTLE_MS);

  let state = await resolvePostEmailState(page, { isOnAdobeSite });
  let authErrorReason = await getAuthPageErrorReason(page, { skipPasswordErrorIfFieldEmpty: true });
  if (authErrorReason) {
    throw new Error(authErrorReason);
  }

  if (state === "2fa") {
    await runOtpIfPresent(page, otpOptions, { stage: "after-email", isOnAdobeSite });
    await enterPassword(page, password, { afterOtp: true });
    authErrorReason = await getAuthPageErrorReason(page);
    if (authErrorReason) {
      throw new Error(authErrorReason);
    }
    return;
  }

  if (state === "password") {
    await enterPassword(page, password);
    return;
  }

  if (state === "done") {
    return;
  }

  // Adobe đôi lúc chuyển màn chậm; cho thêm 1 nhịp chờ trước khi fail.
  await page.waitForTimeout(LOGIN_TIMEOUTS.EMAIL_SUBMIT_SETTLE_MS);
  const retryState = await resolvePostEmailState(page, {
    isOnAdobeSite,
    timeoutMs: LOGIN_TIMEOUTS.SCREEN_DETECT_MS * 2,
  });
  authErrorReason = await getAuthPageErrorReason(page, { skipPasswordErrorIfFieldEmpty: true });
  if (authErrorReason) {
    throw new Error(authErrorReason);
  }
  if (retryState === "password") {
    await enterPassword(page, password);
    return;
  }
  if (retryState === "done") {
    return;
  }

  if (!(typeof isOnAdobeSite === "function" && isOnAdobeSite(page.url()))) {
    throw new Error("Không thấy màn nhập mật khẩu sau khi nhập email.");
  }
}

module.exports = {
  runCredentialsFixedOnce,
  waitForEmailInput,
  enterPassword,
};
