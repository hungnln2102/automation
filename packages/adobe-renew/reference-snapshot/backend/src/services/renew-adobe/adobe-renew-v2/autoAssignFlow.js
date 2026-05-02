/**
 * Adobe Renew V2 — B14: Lấy/tạo URL auto-assign bằng API (không thao tác UI).
 */

const logger = require("../../../utils/logger");
const { doFormLoginOnAuthPage } = require("./loginFlow");
const { fromPwCookies } = require("./runCheckFlow");

function normalizeOrgToken(orgId) {
  const raw = String(orgId || "").trim();
  if (!raw) return "";
  return raw.includes("@AdobeOrg") ? raw : `${raw}@AdobeOrg`;
}

async function captureAuthHeadersFromUsersPage(page, orgToken) {
  const reqPromise = page.waitForRequest(
    (req) =>
      (req.method() === "GET" || req.method() === "HEAD") &&
      req.url().includes(`/jil-api/v2/organizations/${orgToken}/users`),
    { timeout: 30000 }
  );

  await page.goto(`https://adminconsole.adobe.com/${orgToken}/users`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const req = await reqPromise;
  const headers = req.headers();
  const authorization = headers.authorization || headers.Authorization || "";
  const xApiKey = headers["x-api-key"] || headers["X-Api-Key"] || "";
  if (!authorization || !xApiKey) {
    throw new Error("Thiếu authorization/x-api-key từ phiên Adobe.");
  }

  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    authorization,
    "x-api-key": xApiKey,
    "x-requested-with": headers["x-requested-with"] || "XMLHttpRequest",
    "x-jil-feature": headers["x-jil-feature"] || "",
    origin: "https://adminconsole.adobe.com",
    referer: `https://adminconsole.adobe.com/${orgToken}/products/auto-assign`,
  };
}

async function getProducts(api, orgToken, headers) {
  const url =
    `https://bps-il.adobe.io/jil-api/v2/organizations/${orgToken}/products/` +
    "?include_created_date=true&include_expired=true&include_groups_quantity=true" +
    "&include_inactive=false&include_license_activations=true&include_license_allocation_info=false" +
    "&includeAcquiredOfferIds=false&includeConfiguredProductArrangementId=false" +
    "&includeLegacyLSFields=false&license_group_limit=100&processing_instruction_codes=administration,license_data";
  const resp = await api.get(url, { headers, timeout: 30000 });
  const body = await resp.text();
  if (!resp.ok()) throw new Error(`Products API fail ${resp.status()}: ${body.slice(0, 300)}`);
  let list = JSON.parse(body);
  if (!Array.isArray(list)) list = list?.items || list?.data || [];
  return Array.isArray(list) ? list : [];
}

async function getLicenseGroups(api, orgToken, productId, headers) {
  const url = `https://bps-il.adobe.io/jil-api/v2/organizations/${orgToken}/products/${productId}/license-groups/`;
  const resp = await api.get(url, { headers, timeout: 30000 });
  const body = await resp.text();
  if (!resp.ok()) throw new Error(`License groups API fail ${resp.status()}: ${body.slice(0, 300)}`);
  let list = JSON.parse(body);
  if (!Array.isArray(list)) list = list?.items || list?.data || list?.licenseGroups || [];
  return Array.isArray(list) ? list : [];
}

async function getRules(api, orgToken, headers) {
  const resp = await api.get(`https://acrs.adobe.io/organization/${orgToken}/product_auth_rules`, {
    headers,
    timeout: 30000,
  });
  const body = await resp.text();
  if (!resp.ok()) throw new Error(`Rules API fail ${resp.status()}: ${body.slice(0, 300)}`);
  let list = JSON.parse(body);
  if (!Array.isArray(list)) list = list?.items || list?.data || [];
  return Array.isArray(list) ? list : [];
}

function resolveRuleUrl(rule) {
  return (
    rule?.browserURL ||
    rule?.browseURL ||
    rule?.requestURL?.browseURL ||
    null
  );
}

async function getOrCreateAutoAssignUrlWithPage(page, orgId, email, password, options = {}) {
  if (!orgId || !email || !password) {
    logger.warn("[adobe-v2] B14(API): Thiếu orgId/email/password");
    return { url: null, savedCookies: null };
  }

  const orgToken = normalizeOrgToken(orgId);
  const context = page.context();
  const mailBackupId = options.mailBackupId ?? null;
  const otpSource = options.otpSource ?? "imap";
  let freshCookies = null;

  try {
    // Đảm bảo session hợp lệ trước khi lấy auth headers.
    await page
      .goto(`https://adminconsole.adobe.com/${orgToken}/overview`, {
        waitUntil: "domcontentloaded",
        timeout: 40000,
      })
      .catch(() => {});

    const currentUrl = page.url();
    if (currentUrl.includes("auth.services") || currentUrl.includes("adobelogin.com")) {
      const loginOk = await doFormLoginOnAuthPage(page, email, password, {
        mailBackupId,
        otpSource,
        accountEmail: email,
      });
      if (!loginOk) {
        freshCookies = fromPwCookies(await context.cookies());
        return { url: null, savedCookies: freshCookies };
      }
    }

    const headers = await captureAuthHeadersFromUsersPage(page, orgToken);
    const api = context.request;

    const rulesBefore = await getRules(api, orgToken, headers);
    const existing = rulesBefore.find(
      (r) => String(r?.status || "").toUpperCase() === "ACTIVE" &&
        String(r?.triggers || "").toUpperCase() === "ON_DEMAND_OR_URL"
    );
    const existingUrl = resolveRuleUrl(existing);
    if (existingUrl) {
      freshCookies = fromPwCookies(await context.cookies());
      logger.info("[adobe-v2] B14(API): Dùng rule có sẵn → %s", existingUrl);
      return { url: existingUrl, savedCookies: freshCookies };
    }

    const products = await getProducts(api, orgToken, headers);
    const product = products.find((p) => String(p?.status || "").toLowerCase() !== "expired") || products[0];
    if (!product) throw new Error("Không có product để tạo auto-assign.");
    const productId = String(product.id || product.productId || "").trim();
    if (!productId) throw new Error("Không lấy được productId.");

    const groups = await getLicenseGroups(api, orgToken, productId, headers);
    const group =
      groups.find((g) => {
        const total = Number(g.totalQuantity || 0);
        const assigned = Number(g.assignedQuantity || 0);
        return Number.isFinite(total) && Number.isFinite(assigned) ? assigned < total : true;
      }) || groups[0];
    if (!group) throw new Error("Không có license group để tạo rule.");

    const productProfile = String(group.id || group.productProfile || group.profileId || "").trim();
    const licenseId = String(group.licenseId || productId).trim();
    if (!productProfile || !licenseId) throw new Error("Thiếu productProfile/licenseId.");

    const label = `AUTO_${Date.now()}`;
    const payload = {
      label,
      licenseId,
      productProfile,
      status: "ACTIVE",
      triggers: "ON_DEMAND_OR_URL",
      userScope: "ORGANIZATION",
    };

    const createResp = await api.post(
      `https://acrs.adobe.io/organization/${orgToken}/product_auth_rules?consumeAppAuthRequests=false`,
      { headers, data: payload, timeout: 30000 }
    );
    const createBody = await createResp.text();
    if (!createResp.ok()) {
      throw new Error(`Create rule fail ${createResp.status()}: ${createBody.slice(0, 300)}`);
    }

    let createdRule = null;
    try {
      const parsed = JSON.parse(createBody || "{}");
      createdRule = parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {}

    const directUrl = resolveRuleUrl(createdRule);
    if (directUrl) {
      freshCookies = fromPwCookies(await context.cookies());
      logger.info("[adobe-v2] B14(API): URL từ create response → %s", directUrl);
      return { url: directUrl, savedCookies: freshCookies };
    }

    const rulesAfter = await getRules(api, orgToken, headers);
    const matched =
      rulesAfter.find((r) => String(r?.label || "") === label) ||
      rulesAfter.find(
        (r) =>
          String(r?.licenseId || "") === licenseId &&
          String(r?.productProfile || "") === productProfile &&
          String(r?.triggers || "").toUpperCase() === "ON_DEMAND_OR_URL"
      ) ||
      null;
    const url = resolveRuleUrl(matched);

    freshCookies = fromPwCookies(await context.cookies());
    if (url) {
      logger.info("[adobe-v2] B14(API): URL từ rules list → %s", url);
      return { url, savedCookies: freshCookies };
    }
    return { url: null, savedCookies: freshCookies };
  } catch (err) {
    logger.error("[adobe-v2] B14(API) error: %s", err.message);
    freshCookies = fromPwCookies(await context.cookies().catch(() => []));
    return { url: null, savedCookies: freshCookies };
  }
}

module.exports = {
  getOrCreateAutoAssignUrlWithPage,
};
