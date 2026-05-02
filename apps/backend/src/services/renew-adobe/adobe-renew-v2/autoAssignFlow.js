/**
 * Adobe Renew V2 — B14: Lấy/tạo URL auto-assign bằng API (không thao tác UI).
 * Chọn product + licenseId/productProfile khớp gói CCP đã verify (B12/B13) và thử vài payload ACRS.
 */

const logger = require("../../../utils/logger");
const { doFormLoginOnAuthPage } = require("./loginFlow");
const { fromPwCookies } = require("./runCheckFlow");
const { orgTokenMatchesJilOrganizationsPath } = require("./shared/usersListApi");

function normalizeOrgToken(orgId) {
  const raw = String(orgId || "").trim();
  if (!raw) return "";
  return raw.includes("@AdobeOrg") ? raw : `${raw}@AdobeOrg`;
}

function normalizeProductIdList(preferredIds) {
  if (!Array.isArray(preferredIds)) return [];
  const out = [];
  for (const x of preferredIds) {
    const s = String(x || "").trim();
    if (s) out.push(s.toUpperCase());
  }
  return out;
}

/**
 * Ưu tiên product đã pin / verified CCP; tránh lấy nhầm product khác trong org (ACRS hay trả 400).
 */
function pickProductForAutoAssign(products, preferredIds) {
  const list = Array.isArray(products) ? products : [];
  const pref = normalizeProductIdList(preferredIds);
  if (pref.length > 0) {
    const match = list.find((p) => {
      const id = String(p?.id || p?.productId || "").trim();
      return id && pref.includes(id.toUpperCase());
    });
    if (match) {
      logger.info(
        "[adobe-v2] B14(API): chọn product khớp preferred CCP id=%s",
        String(match.id || match.productId || "").slice(0, 12)
      );
      return match;
    }
    logger.warn(
      "[adobe-v2] B14(API): không khớp preferred CCP trong danh sách products — fallback product đầu hợp lệ"
    );
  }
  return (
    list.find((p) => String(p?.status || "").toLowerCase() !== "expired") || list[0] || null
  );
}

async function captureAuthHeadersFromUsersPage(page, orgToken) {
  const reqPromise = page.waitForRequest(
    (req) =>
      (req.method() === "GET" || req.method() === "HEAD") &&
      orgTokenMatchesJilOrganizationsPath(req.url(), orgToken),
    { timeout: 35000 }
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
  if (!rule || typeof rule !== "object") return null;
  const direct =
    rule.browserURL ||
    rule.browseURL ||
    rule.browserUrl ||
    rule.url ||
    rule.requestURL?.browseURL ||
    rule.requestURL?.browserURL ||
    null;
  return direct ? String(direct).trim() || null : null;
}

/** Trích licenseId + productProfile theo nhiều key JIL (parentLicenseId, delegation…) — thiếu field hay gây 400 ACRS. */
function resolveLicenseGroupForAcrs(group, productId) {
  const pid = String(productId || "").trim();
  const productProfile = String(
    group?.id ??
      group?.productProfile ??
      group?.profileId ??
      group?.product_profile_id ??
      group?.licenseGroupId ??
      ""
  ).trim();
  const licenseId = String(
    group?.licenseId ??
      group?.license_id ??
      group?.parentLicenseId ??
      group?.parent_license_id ??
      group?.contractLicenseId ??
      group?.delegationLicenseId ??
      group?.imsLicenseId ??
      pid
  ).trim();
  return { productProfile, licenseId };
}

async function postCreateProductAuthRule(api, orgToken, headers, basePayload) {
  const urls = [
    `https://acrs.adobe.io/organization/${orgToken}/product_auth_rules?consumeAppAuthRequests=false`,
    `https://acrs.adobe.io/organization/${orgToken}/product_auth_rules`,
  ];
  const variants = [
    { ...basePayload, userScope: "ORGANIZATION" },
    { ...basePayload, userScope: "ORGANIZATION", assignmentMode: "LICENSE_DELEGATION" },
    { ...basePayload, userScope: "ALL" },
    { ...basePayload, userScope: "ALL", assignmentMode: "LICENSE_DELEGATION" },
    { ...basePayload },
  ];

  let lastBody = "";
  for (const data of variants) {
    for (const url of urls) {
      const createResp = await api.post(url, { headers, data, timeout: 30000 });
      const text = await createResp.text();
      if (createResp.ok()) {
        logger.info(
          "[adobe-v2] B14(API): create rule OK userScope=%s assignmentMode=%s endpoint=%s",
          data.userScope ?? "(none)",
          data.assignmentMode ?? "(none)",
          url.includes("consume") ? "consume=false" : "default"
        );
        return text;
      }
      lastBody = text;
      if (createResp.status() !== 400) {
        throw new Error(`Create rule fail ${createResp.status()}: ${text.slice(0, 800)}`);
      }
    }
  }
  throw new Error(
    `Create rule fail 400 (đã thử payload/URL): ${lastBody.slice(0, 900)}`
  );
}

/**
 * @param {import('playwright').Page} page
 * @param {string} orgId
 * @param {string} email
 * @param {string} password
 * @param {{ mailBackupId?: number|null, otpSource?: string, preferredCcpProductIds?: string[] }} options
 */
async function getOrCreateAutoAssignUrlWithPage(page, orgId, email, password, options = {}) {
  if (!orgId || !email || !password) {
    logger.warn("[adobe-v2] B14(API): Thiếu orgId/email/password");
    return { url: null, savedCookies: null };
  }

  const orgToken = normalizeOrgToken(orgId);
  const context = page.context();
  const mailBackupId = options.mailBackupId ?? null;
  const otpSource = options.otpSource ?? "imap";
  const preferredCcpProductIds = Array.isArray(options.preferredCcpProductIds)
    ? options.preferredCcpProductIds
    : [];
  let freshCookies = null;

  try {
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
      (r) =>
        String(r?.status || "").toUpperCase() === "ACTIVE" &&
        String(r?.triggers || "").toUpperCase() === "ON_DEMAND_OR_URL"
    );
    const existingUrl = resolveRuleUrl(existing);
    if (existingUrl) {
      freshCookies = fromPwCookies(await context.cookies());
      logger.info("[adobe-v2] B14(API): Dùng rule có sẵn → %s", existingUrl);
      return { url: existingUrl, savedCookies: freshCookies };
    }

    const products = await getProducts(api, orgToken, headers);
    const product = pickProductForAutoAssign(products, preferredCcpProductIds);
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

    const { productProfile, licenseId } = resolveLicenseGroupForAcrs(group, productId);
    if (!productProfile || !licenseId) {
      throw new Error(
        `Thiếu productProfile/licenseId sau resolve (group keys=${Object.keys(group || {}).slice(0, 20).join(",")}).`
      );
    }

    const label = `AUTO_${Date.now()}`;
    const basePayload = {
      label,
      licenseId,
      productProfile,
      status: "ACTIVE",
      triggers: "ON_DEMAND_OR_URL",
    };

    const createBody = await postCreateProductAuthRule(api, orgToken, headers, basePayload);

    let createdRule = null;
    try {
      const parsed = JSON.parse(createBody || "{}");
      createdRule = parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {}

    if (createdRule) {
      const nested =
        createdRule.productAuthRule ||
        createdRule.product_auth_rule ||
        createdRule.rule ||
        (Array.isArray(createdRule.rules) ? createdRule.rules[0] : null) ||
        createdRule.data;
      if (nested && typeof nested === "object" && !resolveRuleUrl(createdRule)) {
        createdRule = nested;
      }
    }

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
    logger.warn(
      "[adobe-v2] B14(API): Không trích được URL (body ~%s)",
      (createBody || "").slice(0, 400)
    );
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
