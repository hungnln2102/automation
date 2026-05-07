const logger = require("../../../../utils/logger");
const { ADMIN_CONSOLE_API_BASE, resolveAdobeEmbedPageUrl } = require("./constants");
const {
  normalizeOrgToken,
  buildForwardHeadersFromCapturedRequest,
} = require("./usersListApi");
const {
  checkOrgLicenseCapacity,
  extractCcpSeatProductIdsFromOrgProductsList,
} = require("./accessChecks");

/**
 * Query mặc định khi không parse được từ request đã bắt — khớp SPA www.adobe.com/manage-team (JIL products).
 */
const PRODUCTS_LIST_QUERY_MANAGE_TEAM =
  "?include_created_date=true&include_expired=true&include_groups_quantity=false" +
  "&include_inactive=false&include_legacy_ls_fields=true&include_license_activations=true" +
  "&include_license_allocation_info=false&include_pricing_data=false&includeFulfillableItemCodesOnly=true" +
  "&processing_instruction_codes=administration";

/**
 * Lấy nguyên `?include=…` từ URL request mà trình duyệt vừa gửi (manage-team hoặc admin console) để gọi lại cho đúng contract.
 */
function extractProductsListQueryFromRequestUrl(reqUrl) {
  try {
    const parsed = new URL(String(reqUrl || ""));
    const path = String(parsed.pathname || "").replace(/\/+$/, "");
    if (!/\/products$/i.test(path)) return null;
    const search = parsed.search;
    return search && search.length > 1 ? search : null;
  } catch (_) {
    return null;
  }
}

function extractOrgTokenFromProductsRequestUrl(reqUrl) {
  try {
    const parsed = new URL(String(reqUrl || ""));
    const path = String(parsed.pathname || "");
    const m = path.match(/\/jil-api\/v2\/organizations\/([^/]+)\/products\/?$/i);
    if (!m) return null;
    return normalizeOrgToken(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

function isAdobeEmbedHostPageUrl(url) {
  const u = String(url || "");
  return (
    /:\/\/(www\.)?adobe\.com\//i.test(u) ||
    /:\/\/account\.adobe\.com\//i.test(u) ||
    /:\/\/experience\.adobe\.com\//i.test(u)
  );
}

function buildProductsApiDetailsFromList(list, orgToken) {
  const ids = extractCcpSeatProductIdsFromOrgProductsList(list);
  const capacity = checkOrgLicenseCapacity(list);
  const token = orgToken ? normalizeOrgToken(orgToken) : "";
  const orgId = token ? token.replace(/@AdobeOrg$/i, "") : null;
  return {
    ok: true,
    ids,
    orgId,
    orgToken: token || null,
    products: Array.isArray(list) ? list : [],
    orgProductCount: Array.isArray(list) ? list.length : 0,
    contractActiveLicenseCount: Number(capacity.contractActiveLicenseCount || 0),
    licenseStatus: capacity.licenseStatus || "unknown",
    error: null,
  };
}

async function captureProductsApiHeadersFromProductsPage(page, orgToken = "") {
  const seedToken = orgToken ? normalizeOrgToken(orgToken) : "";
  const seedHex = seedToken ? seedToken.split("@")[0] : "";
  const productsHref = seedToken
    ? `https://adminconsole.adobe.com/${seedToken}/products`
    : "https://adminconsole.adobe.com/products";
  const matchProducts = (req) => {
    if (req.method() !== "GET") return false;
    const token = extractOrgTokenFromProductsRequestUrl(req.url());
    if (!token) return false;
    if (!seedHex) return true;
    return token.toLowerCase().includes(seedHex.toLowerCase());
  };
  const reqPromise = page.waitForRequest(matchProducts, { timeout: 8000 });
  await page.goto(productsHref, {
    waitUntil: "domcontentloaded",
    timeout: 35000,
  }).catch(() => {});
  const req = await reqPromise;
  const capturedToken = extractOrgTokenFromProductsRequestUrl(req.url()) || seedToken;
  const forwardedHeaders = buildForwardHeadersFromCapturedRequest(req);
  const productsListQuery =
    extractProductsListQueryFromRequestUrl(req.url()) || PRODUCTS_LIST_QUERY_MANAGE_TEAM;
  return { forwardedHeaders, productsListQuery, orgToken: capturedToken };
}

async function captureProductsApiHeaders(page, orgToken) {
  const token = normalizeOrgToken(orgToken);
  const matchProducts = (req) =>
    req.method() === "GET" &&
    req.url().includes(`/jil-api/v2/organizations/${token}/products`) &&
    !req.url().includes("/users");

  const embedUrl = resolveAdobeEmbedPageUrl();
  const orgHex = token.split("@")[0] || "";
  const productsHref = `https://adminconsole.adobe.com/${token}/products`;

  const captureOnce = async (navFn) => {
    const reqPromise = page.waitForRequest(matchProducts, { timeout: 32000 });
    await navFn();
    return reqPromise;
  };

  const buildResult = (req) => {
    const forwardedHeaders = buildForwardHeadersFromCapturedRequest(req);
    const productsListQuery =
      extractProductsListQueryFromRequestUrl(req.url()) || PRODUCTS_LIST_QUERY_MANAGE_TEAM;
    return { forwardedHeaders, productsListQuery };
  };

  /** Admin Console products là nơi JIL products được gọi ổn định; tránh goto embed mặc định (hay gặp net::ERR_HTTP2_PROTOCOL_ERROR trên một số host). */
  try {
    const req = await captureOnce(async () => {
      const u = String(page.url() || "");
      if (
        /adminconsole\.adobe\.com\/[^/]+@AdobeOrg\/products/i.test(u) &&
        (orgHex ? u.includes(orgHex) : true)
      ) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
        return;
      }
      await page.goto(productsHref, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    });
    return buildResult(req);
  } catch (e1) {
    logger.warn(
      "[adobe-v2] products-api: không bắt JIL trên adminconsole/products (%s), thử embed (%s)",
      e1.message,
      embedUrl
    );
    const req = await captureOnce(async () => {
      const u2 = String(page.url() || "");
      if (isAdobeEmbedHostPageUrl(u2)) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
        return;
      }
      await page.goto(embedUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    });
    return buildResult(req);
  }
}

async function fetchOrganizationProductsJson(
  page,
  orgToken,
  forwardedHeaders,
  productsListQuery
) {
  const token = normalizeOrgToken(orgToken);
  const raw = String(productsListQuery || "").trim() || PRODUCTS_LIST_QUERY_MANAGE_TEAM;
  const query = raw.startsWith("?") ? raw : `?${raw}`;
  const url = `${ADMIN_CONSOLE_API_BASE}/jil-api/v2/organizations/${token}/products${query}`;
  const resp = await page.context().request.get(url, { headers: forwardedHeaders, timeout: 30000 });
  const text = await resp.text().catch(() => "");
  if (!resp.ok()) {
    throw new Error(`Products API fail ${resp.status()}: ${text.slice(0, 220)}`);
  }
  let list = [];
  try {
    const parsed = JSON.parse(text || "[]");
    list = Array.isArray(parsed) ? parsed : parsed?.items || parsed?.data || [];
  } catch (e) {
    throw new Error(`Products API parse fail: ${e.message}`);
  }
  return Array.isArray(list) ? list : [];
}

async function fetchCcpSeatProductIdsFromProductsPageApiDetails(page, orgId = "") {
  try {
    const { forwardedHeaders, productsListQuery, orgToken } =
      await captureProductsApiHeadersFromProductsPage(page, orgId);
    const list = await fetchOrganizationProductsJson(
      page,
      orgToken,
      forwardedHeaders,
      productsListQuery
    );
    const details = buildProductsApiDetailsFromList(list, orgToken);
    logger.info(
      "[adobe-v2] products-api-fast: org products=%d, ccp_seat_count=%d, ccp_seat_product_ids=[%s]",
      details.orgProductCount,
      details.ids.length,
      details.ids.join(", ")
    );
    return details;
  } catch (e) {
    logger.warn("[adobe-v2] products-api-fast: không lấy được id CCP seat: %s", e.message);
    return {
      ok: false,
      ids: [],
      orgId: null,
      orgToken: null,
      products: [],
      orgProductCount: 0,
      contractActiveLicenseCount: 0,
      licenseStatus: "unknown",
      error: e.message,
    };
  }
}

/**
 * Sau B12 (trang products): gọi JIL products API, trích các productId CCP (Creative Cloud Pro).
 * Dùng để đối chiếu tuyệt đối với `products` trên từng user từ users API.
 */
async function fetchCcpSeatProductIdsFromOrgProductsApiDetails(page, orgId) {
  const orgNorm = String(orgId || "").trim();
  if (!orgNorm) {
    return { ok: false, ids: [], orgProductCount: 0, error: "missing_org_id" };
  }
  const token = normalizeOrgToken(orgNorm);
  try {
    const { forwardedHeaders, productsListQuery } = await captureProductsApiHeaders(page, token);
    const list = await fetchOrganizationProductsJson(
      page,
      token,
      forwardedHeaders,
      productsListQuery
    );
    const details = buildProductsApiDetailsFromList(list, token);
    logger.info(
      "[adobe-v2] products-api: org products=%d, ccp_seat_count=%d, ccp_seat_product_ids=[%s]",
      details.orgProductCount,
      details.ids.length,
      details.ids.join(", ")
    );
    return details;
  } catch (e) {
    logger.warn("[adobe-v2] products-api: không lấy được id CCP seat: %s", e.message);
    return { ok: false, ids: [], orgProductCount: 0, error: e.message };
  }
}

async function fetchVerifiedCcpSeatProductIdsFromOrgProductsApi(page, orgId) {
  const result = await fetchCcpSeatProductIdsFromOrgProductsApiDetails(page, orgId);
  return result.ids;
}

module.exports = {
  fetchVerifiedCcpSeatProductIdsFromOrgProductsApi,
  fetchCcpSeatProductIdsFromOrgProductsApiDetails,
  fetchCcpSeatProductIdsFromProductsPageApiDetails,
  captureProductsApiHeaders,
  captureProductsApiHeadersFromProductsPage,
  fetchOrganizationProductsJson,
  extractOrgTokenFromProductsRequestUrl,
  extractProductsListQueryFromRequestUrl,
  PRODUCTS_LIST_QUERY_MANAGE_TEAM,
};
