/**
 * Adobe Renew V2 — Luồng lấy thông tin B10→B13.
 * Admin Console (Profile/Org switcher) → products → users.
 */

const logger = require("../../../utils/logger");
const { runCheckOrgNameFlow, runCheckProductFlow, extractOrgIdFromUrl } = require("./flows/check");
const { fetchUsersViaApi } = require("./shared/usersListApi");
const { fetchVerifiedCcpSeatProductIdsFromOrgProductsApi } = require("./shared/orgProductsApi");

const ADMIN_USERS = "https://adminconsole.adobe.com/users";

/** Cron/headless trên server thường chậm hơn tay bấm — mặc định 90s; ghi đè bằng ADOBE_V2_WAIT_USERS_MS. */
const WAIT_USERS_MS = (() => {
  const n = Number.parseInt(process.env.ADOBE_V2_WAIT_USERS_MS || "", 10);
  return Number.isFinite(n) && n >= 30000 ? n : 90000;
})();

function toNonNegativeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function deriveLicenseStatusByContractCount(contractActiveLicenseCount) {
  const n = Number(contractActiveLicenseCount || 0);
  return n > 0 ? "Paid" : "Expired";
}

function extractOrgIdFromToken(orgToken) {
  const token = String(orgToken || "").trim();
  if (!token) return null;
  const m = token.match(/^([A-Fa-f0-9]{20,})@AdobeOrg$/);
  return m ? m[1] : null;
}

const B13_GOTO_MS = (() => {
  const n = Number.parseInt(process.env.ADOBE_V2_B13_GOTO_MS || "", 10);
  return Number.isFinite(n) && n >= 30000 ? n : 60000;
})();

const USERS_GRID_WAIT_MS = (() => {
  const n = Number.parseInt(process.env.ADOBE_V2_B13_GRID_WAIT_MS || "", 10);
  return Number.isFinite(n) && n >= 15000 ? n : 32000;
})();

/** Giống add/delete users flow: trang users thật thường là /{orgId}@AdobeOrg/users */
function buildAdminUsersUrl(orgId) {
  const id = orgId && String(orgId).trim();
  if (id) return `https://adminconsole.adobe.com/${id}@AdobeOrg/users`;
  return ADMIN_USERS;
}

function isAdminConsoleUsersPath(url) {
  if (!url || typeof url !== "string") return false;
  if (!/adminconsole\.adobe\.com/i.test(url)) return false;
  return (
    url.includes("@AdobeOrg/users") ||
    /\/users(?:\/|$|\?|#)/i.test(url)
  );
}

/** SPA Adobe đôi khi giữ /products hoặc route khác dù đã goto /users — cần nudge định kỳ. */
function isAdminConsoleOrgScopedNonUsers(url) {
  if (!url || typeof url !== "string") return false;
  if (!/adminconsole\.adobe\.com/i.test(url)) return false;
  if (!/@AdobeOrg\//i.test(url)) return false;
  return !isAdminConsoleUsersPath(url);
}

/**
 * Cần goto lại URL users đã biết (recovery) khi đang kẹt trên Admin Console nhưng không phải trang users.
 * Bao gồm cả /{org}@AdobeOrg/products và redirect global tới /products (không có @AdobeOrg trong path).
 */
function needsUsersPageRecovery(url) {
  if (!url || typeof url !== "string") return false;
  if (!/adminconsole\.adobe\.com/i.test(url)) return false;
  if (isAdminConsoleUsersPath(url)) return false;
  if (isAdminConsoleOrgScopedNonUsers(url)) return true;
  if (/\/products(?:\/|$|\?|#)/i.test(url)) return true;
  return false;
}

const USERS_READY_SELECTOR = [
  '[data-testid^="member-email-"]',
  '[data-testid="table"]',
  '[role="grid"] [role="row"][data-key]',
  '[role="rowgroup"] [role="row"]',
  '[aria-label="Người dùng"]',
  '[aria-label="Users"]',
  '[role="grid"] [role="row"]',
  "table tbody tr",
].join(", ");

/** Chờ trang users adminconsole load xong (bảng hoặc member-email xuất hiện) trước khi scrape. */
async function waitForUsersPageReady(page, timeoutMs = WAIT_USERS_MS, options = {}) {
  const recoveryUsersUrl =
    options.recoveryUsersUrl && String(options.recoveryUsersUrl).trim()
      ? String(options.recoveryUsersUrl).trim()
      : "";
  const recoverEveryMs = 10000;
  /** Cho phép recover ngay lần đầu gặp route sai (SPA Adobe hay giữ /products). */
  let lastRecoveryAt = Date.now() - recoverEveryMs;
  /** Đã đúng URL /users nhưng grid chưa render — reload có thể gỡ kẹt SPA trên server chậm. */
  let usersPathNoGridPasses = 0;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!isAdminConsoleUsersPath(url)) {
      usersPathNoGridPasses = 0;
      const now = Date.now();
      if (
        recoveryUsersUrl &&
        needsUsersPageRecovery(url) &&
        now - lastRecoveryAt >= recoverEveryMs
      ) {
        lastRecoveryAt = now;
        logger.info("[adobe-v2] B13: Chưa vào route /users — goto lại (%s)", recoveryUsersUrl.slice(0, 96));
        await page.goto(recoveryUsersUrl, { waitUntil: "domcontentloaded", timeout: B13_GOTO_MS }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 28000 }).catch(() => {});
        await page.waitForTimeout(900);
      }
      await page.waitForTimeout(1200);
      continue;
    }
    const ready = await page
      .locator(USERS_READY_SELECTOR)
      .first()
      .waitFor({ state: "visible", timeout: USERS_GRID_WAIT_MS })
      .then(() => true)
      .catch(() => false);
    if (ready) {
      await page.waitForTimeout(1800);
      logger.info("[adobe-v2] B13: Trang users đã load xong");
      return;
    }
    usersPathNoGridPasses += 1;
    if (usersPathNoGridPasses === 2 || usersPathNoGridPasses % 4 === 0) {
      logger.info(
        "[adobe-v2] B13: Đã vào /users nhưng chưa thấy bảng — thử reload (lần %s)",
        usersPathNoGridPasses
      );
      await page.reload({ waitUntil: "domcontentloaded", timeout: B13_GOTO_MS }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 28000 }).catch(() => {});
      await page.waitForTimeout(1500);
    } else {
      await page.waitForTimeout(1200);
    }
  }
  logger.warn("[adobe-v2] B13: Timeout chờ trang users (vẫn scrape thử)");
}

/** Gỡ kẹt SPA: thử sidebar / link href trước khi bỏ qua. */
async function tryNavigateUsersViaUi(page) {
  const byRole = page.getByRole("link", { name: /^(Users|Người dùng)$/i });
  if (await byRole.first().isVisible({ timeout: 2500 }).catch(() => false)) {
    await byRole.first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 18000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return isAdminConsoleUsersPath(page.url());
  }
  const hrefUsers = page.locator('a[href*="@AdobeOrg/users"], a[href*="/users"]').first();
  if (await hrefUsers.isVisible({ timeout: 2500 }).catch(() => false)) {
    await hrefUsers.click({ timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 18000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return isAdminConsoleUsersPath(page.url());
  }
  return false;
}


function scrapeUsersPage(page) {
  return page.evaluate(() => {
    const out = [];
    const emailEls = document.querySelectorAll('[data-testid^="member-email-"]');
    for (const el of emailEls) {
      const email = el.textContent?.trim() || "";
      const row = el.closest('[role="row"]');
      let name = "";
      if (row) {
        const nameLink = row.querySelector('a.spectrum-Link--primary, a[href*="/users/"]');
        if (nameLink) name = nameLink.textContent?.trim() || "";
      }
      // Chỉ đọc cột Sản phẩm (ô [role=gridcell] cuối). Không dùng tooltip-button-action trên cả hàng —
      // Adobe hay đặt control đó ở cột khác → false positive "có gói" khi cột sản phẩm trống.
      let hasProduct = false;
      if (row) {
        const cells = row.querySelectorAll('[role="gridcell"]');
        const productCell = cells.length ? cells[cells.length - 1] : null;
        if (productCell) {
          hasProduct = !!(
            productCell.querySelector('[data-testid="image-icon"]') ||
            productCell.querySelector("img")
          );
        }
      }
      out.push({ name, email, hasProduct });
    }
    return out;
  }).catch(() => []);
}

/**
 * B10–B13: Profile name (account.adobe.com) → products → users (adminconsole).
 * Nếu options.existingOrgName có sẵn thì bỏ qua B10–B11 (không vào account.adobe.com lấy profile).
 * @param {import('playwright').Page} page
 * @param {{ existingOrgName?: string|null, cachedContractActiveLicenseCount?: number|null, forceProductCheck?: boolean, adminLoginEmail?: string|null, pinnedCcpProductIds?: string[] }} options
 * @returns {Promise<{ org_name: string|null, orgId: string|null, license_status: string, products: any[], users: any[], contractActiveLicenseCount: number, ccpSeatProductIds: string[], jil_users_raw_pages?: unknown[] }>}
 */
async function runB10ToB13(page, options = {}) {
  const existingOrgName = options.existingOrgName && String(options.existingOrgName).trim() ? String(options.existingOrgName).trim() : null;
  const cachedContractActiveLicenseCount = toNonNegativeNumber(
    options.cachedContractActiveLicenseCount
  );
  const forceProductCheck = options.forceProductCheck === true;
  const adminLoginEmail =
    options.adminLoginEmail && String(options.adminLoginEmail).trim()
      ? String(options.adminLoginEmail).trim()
      : "";
  const pinnedCcpProductIds = Array.isArray(options.pinnedCcpProductIds)
    ? options.pinnedCcpProductIds
    : [];
  let org_name = null;
  let orgId = null;
  let products = [];
  let users = [];
  let license_status = "unknown";
  let contractActiveLicenseCount = 0;
  /** @type {string[]} */
  let ccpSeatProductIds = [];
  let ranProductPageCheck = false;
  /** @type {unknown[]|null} */
  let jilUsersRawPages = null;
  const mergeJilRaw = (apiUsersResult) => {
    if (!apiUsersResult?.jilRawPages || !Array.isArray(apiUsersResult.jilRawPages)) return;
    if (!jilUsersRawPages) jilUsersRawPages = [];
    jilUsersRawPages.push(...apiUsersResult.jilRawPages);
  };

  const orgResult = await runCheckOrgNameFlow(page, { existingOrgName });
  org_name = orgResult.org_name;

  if (!forceProductCheck && cachedContractActiveLicenseCount != null) {
    contractActiveLicenseCount = cachedContractActiveLicenseCount;
    license_status = deriveLicenseStatusByContractCount(contractActiveLicenseCount);
    logger.info(
      "[adobe-v2] B12: skip products check, dùng lisencecount cache=%s",
      contractActiveLicenseCount
    );
  } else {
    const productResult = await runCheckProductFlow(page);
    orgId = productResult.orgId || orgId;
    products = productResult.products || [];
    license_status = productResult.license_status || "unknown";
    contractActiveLicenseCount = Number(productResult.contractActiveLicenseCount || 0);
    ranProductPageCheck = true;
  }

  /** Khi skip B12, orgId chưa có — lấy từ URL hiện tại (overview …@AdobeOrg/…) tránh goto /users không org. */
  if (!orgId) {
    const fromPage = extractOrgIdFromUrl(page.url());
    if (fromPage) {
      orgId = fromPage;
      logger.info("[adobe-v2] B13: orgId từ URL hiện tại=%s", orgId);
    }
  }

  /** JIL products API (sau B12): lấy đúng productId CCP seat trước khi đọc users — đối chiếu id tuyệt đối. */
  if (ranProductPageCheck && orgId) {
    ccpSeatProductIds = await fetchVerifiedCcpSeatProductIdsFromOrgProductsApi(page, orgId);
  }

  const usersUrlPrimary = buildAdminUsersUrl(orgId);
  logger.info("[adobe-v2] B13: adminconsole/users (url=%s)", usersUrlPrimary.slice(0, 96));

  await page.goto(usersUrlPrimary, {
    waitUntil: "domcontentloaded",
    timeout: B13_GOTO_MS,
  }).catch((navErr) => {
    logger.warn("[adobe-v2] B13: goto users thất bại: %s", navErr.message);
  });
  /** Tránh networkidle — Adobe SPA dễ treo / làm hỏng context trên một số môi trường headless. */
  await page.waitForLoadState("domcontentloaded", { timeout: 28000 }).catch(() => {});
  await page
    .waitForURL((u) => isAdminConsoleUsersPath(String(u)), { timeout: 20000 })
    .catch(() => {});
  if (!orgId) orgId = extractOrgIdFromUrl(page.url());
  let apiUsers;
  try {
    apiUsers = await fetchUsersViaApi(page, {
      orgId,
      adminEmail: adminLoginEmail,
      pinnedCcpProductIds,
      verifiedCcpSeatProductIds: ccpSeatProductIds,
    });
    mergeJilRaw(apiUsers);
  } catch (usersErr) {
    if (cachedContractActiveLicenseCount == null) {
      throw usersErr;
    }
    logger.warn(
      "[adobe-v2] users-api fail khi skip B12, fallback chạy products check: %s",
      usersErr.message
    );
    const productFallback = await runCheckProductFlow(page);
    orgId = productFallback.orgId || orgId;
    products = productFallback.products || products;
    ranProductPageCheck = true;
    if (orgId) {
      ccpSeatProductIds = await fetchVerifiedCcpSeatProductIdsFromOrgProductsApi(page, orgId);
    }
    await page
      .goto(buildAdminUsersUrl(orgId), {
        waitUntil: "domcontentloaded",
        timeout: B13_GOTO_MS,
      })
      .catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 28000 }).catch(() => {});
    apiUsers = await fetchUsersViaApi(page, {
      orgId,
      adminEmail: adminLoginEmail,
      pinnedCcpProductIds,
      verifiedCcpSeatProductIds: ccpSeatProductIds,
    });
    mergeJilRaw(apiUsers);
  }
  orgId = orgId || extractOrgIdFromToken(apiUsers?.orgToken);
  users = apiUsers.users.map((u) => ({
    id: u.id || null,
    authenticatingAccountId: u.authenticatingAccountId || null,
    name: u.name || "",
    email: u.email || "",
    products: Array.isArray(u.products) ? u.products : [],
    hasProduct: u.hasProduct === true,
  }));
  logger.info("[adobe-v2] users-api: %d", users.length);

  return {
    org_name,
    orgId,
    license_status,
    products,
    users,
    contractActiveLicenseCount,
    ccpSeatProductIds,
    ...(jilUsersRawPages && jilUsersRawPages.length
      ? { jil_users_raw_pages: jilUsersRawPages }
      : {}),
  };
}

module.exports = {
  runB10ToB13,
  needsUsersPageRecovery,
};
