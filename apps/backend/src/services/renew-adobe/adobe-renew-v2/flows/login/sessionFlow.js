const DEFAULT_COOKIE_EXPIRY_DAYS = 3;

function toPwCookies(cookies) {
  const now = Math.floor(Date.now() / 1000);
  const defaultExpiry = now + DEFAULT_COOKIE_EXPIRY_DAYS * 24 * 3600;
  return (cookies || [])
    .filter((c) => c.name && c.domain)
    .filter((c) => {
      const exp = c.expirationDate ?? defaultExpiry;
      return exp > now;
    })
    .map((c) => {
      const expires = c.expirationDate && c.expirationDate > 0 ? c.expirationDate : defaultExpiry;
      return {
        name: c.name,
        value: c.value || "",
        domain: c.domain,
        path: c.path || "/",
        expires,
        httpOnly: !!c.httpOnly,
        secure: c.secure !== false,
        sameSite: (c.sameSite || "Lax").toString() === "None" ? "None" : "Lax",
      };
    });
}

function fromPwCookies(cookies) {
  const now = Math.floor(Date.now() / 1000);
  const defaultExpiry = now + DEFAULT_COOKIE_EXPIRY_DAYS * 24 * 3600;
  return (cookies || []).map((c) => {
    const isSession = !c.expires || c.expires <= 0;
    const expirationDate = c.expires > 0 ? c.expires : defaultExpiry;
    return {
      name: c.name,
      value: c.value || "",
      domain: c.domain,
      path: c.path || "/",
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
      sameSite: c.sameSite || "Lax",
      expirationDate,
      session: isSession,
    };
  });
}

async function exportCookies(context, { includeWithExpiry = false } = {}) {
  const rawCookies = await context.cookies();
  const cookies = fromPwCookies(rawCookies);
  const withExpiry = includeWithExpiry
    ? cookies.filter((c) => c.expirationDate && c.expirationDate > Math.floor(Date.now() / 1000)).length
    : null;
  return { cookies, withExpiry };
}

async function detectSessionValid(page, waitMs = 5000) {
  const isLoginUiVisible = async () => {
    const emailInputVisible = await page
      .locator('input[name="username"], input[type="email"], input[name="email"]')
      .first()
      .isVisible()
      .catch(() => false);
    const passwordInputVisible = await page
      .locator('input[type="password"], input#password')
      .first()
      .isVisible()
      .catch(() => false);
    return emailInputVisible || passwordInputVisible;
  };

  const isOrgSwitchVisible = async () =>
    page.locator('button[data-testid="org-switch-button"]').first().isVisible().catch(() => false);

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const urlNow = page.url() || "";
    const onAuthUrl = urlNow.includes("auth.services") || urlNow.includes("adobelogin.com") || urlNow.includes("auth.");

    if (onAuthUrl) return false;
    if (await isLoginUiVisible()) return false;
    if (await isOrgSwitchVisible()) return true;

    await page.waitForTimeout(250);
  }

  return false;
}

module.exports = {
  DEFAULT_COOKIE_EXPIRY_DAYS,
  toPwCookies,
  fromPwCookies,
  exportCookies,
  detectSessionValid,
};
