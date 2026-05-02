const { LOGIN_TIMEOUTS } = require("./loginTimeouts");
const { detectLoginScreen, runOtpIfPresent } = require("./otpFlow");

const PASSWORD_SELECTORS = ['input[name="password"]', 'input[type="password"]', 'input#password'];

async function getAuthPageErrorReason(page) {
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
      return null;
    })
    .catch(() => null);
  return result || null;
}

async function waitForEmailInput(page, timeoutMs = LOGIN_TIMEOUTS.EMAIL_INPUT_WAIT_MS) {
  const emailInput = page
    .locator('input[name="username"], input[type="email"], input[name="email"]')
    .first();
  await emailInput.waitFor({ state: "visible", timeout: timeoutMs });
  return emailInput;
}

async function enterPassword(page, password) {
  const passwordInput = page.locator(PASSWORD_SELECTORS.join(", ")).first();
  await passwordInput.waitFor({
    state: "visible",
    timeout: LOGIN_TIMEOUTS.PASSWORD_INPUT_WAIT_MS,
  });
  await passwordInput.fill(password);
  await page.waitForTimeout(LOGIN_TIMEOUTS.SMALL_WAIT_MS);
  await page.keyboard.press("Enter");
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
  let authErrorReason = await getAuthPageErrorReason(page);
  if (authErrorReason) {
    throw new Error(authErrorReason);
  }

  if (state === "2fa") {
    await runOtpIfPresent(page, otpOptions, { stage: "after-email", isOnAdobeSite });
    await page.waitForTimeout(LOGIN_TIMEOUTS.POST_OTP_SETTLE_MS);
    state = await resolvePostEmailState(page, { isOnAdobeSite });
    authErrorReason = await getAuthPageErrorReason(page);
    if (authErrorReason) {
      throw new Error(authErrorReason);
    }
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
  authErrorReason = await getAuthPageErrorReason(page);
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
