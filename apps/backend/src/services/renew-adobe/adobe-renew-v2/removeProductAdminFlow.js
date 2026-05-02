/**
 * Adobe Renew V2 — B15: Xóa product khỏi admin bằng API assignments.
 */
const logger = require("../../../utils/logger");
const { ADMIN_CONSOLE_API_BASE, TIMEOUTS } = require("./shared/constants");
const { fetchUsersViaApi } = require("./shared/usersListApi");
const { extractProductId } = require("./shared/accessChecks");

async function captureAdobeApiHeaders(page, orgToken) {
  const reqPromise = page.waitForRequest(
    (req) => {
      const url = req.url();
      if (!url.includes("bps-il.adobe.io/jil-api/v2/organizations/")) return false;
      if (!url.includes(orgToken)) return false;
      return req.method() === "GET" || req.method() === "HEAD";
    },
    { timeout: TIMEOUTS.NAVIGATE || 20000 }
  );

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  const req = await reqPromise;
  return req.headers();
}

function reasonFromNonArrayBody(status, rawBody) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawBody || "null");
  } catch (_) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return `http_${status}`;
  }
  const code = String(
    parsed.errorCode ||
      parsed.code ||
      parsed.response?.errorCode ||
      parsed.error?.errorCode ||
      ""
  ).trim();
  if (code) return code.toLowerCase();
  const detail = String(parsed.detail || parsed.message || parsed.title || "").trim();
  if (detail) return detail.length > 160 ? `${detail.slice(0, 160)}…` : detail;
  return `http_${status}`;
}

function normalizePatchResult(status, rawBody) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawBody || "null");
  } catch (_) {
    parsed = null;
  }
  if (!Array.isArray(parsed)) {
    return {
      ok: status >= 200 && status < 300,
      reason: reasonFromNonArrayBody(status, rawBody),
    };
  }
  const first = parsed[0] || {};
  const code = Number(first?.responseCode);
  if (Number.isFinite(code) && code >= 200 && code < 300) {
    return { ok: true, reason: "ok" };
  }
  return {
    ok: false,
    reason: String(first?.response?.errorCode || `http_${status}`),
  };
}

function toProductIdList(user) {
  const products = Array.isArray(user?.products) ? user.products : [];
  return [
    ...new Set(
      products
        .map((p) => String(extractProductId(p) || "").trim())
        .filter(Boolean)
    ),
  ];
}

async function removeAssignmentViaApi(page, orgToken, adminUserId, productId, headers) {
  // Cùng contract với assignProductViaPatch (addUsersFlow): PATCH /users, không phải /assignments.
  const response = await page.context().request.fetch(
    `${ADMIN_CONSOLE_API_BASE}/jil-api/v2/organizations/${orgToken}/users`,
    {
      method: "PATCH",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        origin: "https://adminconsole.adobe.com",
        referer: `https://adminconsole.adobe.com/${orgToken}/users`,
        authorization: headers.authorization || headers.Authorization || "",
        "x-requested-with": headers["x-requested-with"] || "XMLHttpRequest",
        "x-api-key": headers["x-api-key"] || headers["X-Api-Key"] || "",
        "x-jil-feature": headers["x-jil-feature"] || "",
        "x-current-page": "1",
        "x-page-size": "10",
        "x-next-page": "",
        "x-request-id":
          headers["x-request-id"] || `renew-adobe-admin-unassign-${Date.now()}`,
      },
      data: [{ op: "remove", path: `/${adminUserId}/products/${productId}` }],
      timeout: 30000,
    }
  );
  const status = response.status();
  const rawBody = await response.text().catch(() => "");
  const normalized = normalizePatchResult(status, rawBody);
  if (!normalized.ok) {
    logger.warn("[adobe-v2] B15 remove product PATCH: user=%s product=%s status=%s reason=%s body=%s", adminUserId, productId, status, normalized.reason, String(rawBody || "").replace(/\s+/g, " ").trim().slice(0, 320));
  }
  return { status, rawBody, ...normalized };
}

/**
 * @param {import('playwright').Page} page
 * @param {string} adminEmail
 * @param {{ orgId?: string|null }} options
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function runB15RemoveProductFromAdmin(page, adminEmail, options = {}) {
  if (!page || !adminEmail || !String(adminEmail).trim()) {
    return { success: false, error: "Missing page or adminEmail" };
  }
  const email = String(adminEmail).trim().toLowerCase();
  try {
    logger.info("[adobe-v2] B15(API assignments): remove admin products email=%s", email);

    const usersResult = await fetchUsersViaApi(page, { orgId: options.orgId || null });
    const orgToken = usersResult.orgToken;
    const adminUser = (usersResult.users || []).find(
      (u) => String(u?.email || "").trim().toLowerCase() === email
    );
    if (!adminUser?.id) {
      return { success: false, error: "admin_user_not_found" };
    }

    const productIds = toProductIdList(adminUser);
    if (productIds.length === 0) {
      logger.info("[adobe-v2] B15(API assignments): admin has no product -> skip");
      return { success: true };
    }

    const headers = await captureAdobeApiHeaders(page, orgToken);
    const authorization = headers.authorization || headers.Authorization || "";
    const xApiKey = headers["x-api-key"] || headers["X-Api-Key"] || "";
    if (!authorization || !xApiKey) {
      return { success: false, error: "auth_headers_missing" };
    }

    const failed = [];
    for (const productId of productIds) {
      const result = await removeAssignmentViaApi(
        page,
        orgToken,
        String(adminUser.id).trim(),
        productId,
        headers
      );
      if (!result.ok) {
        failed.push({ productId, reason: result.reason });
      }
    }

    if (failed.length === 0) {
      logger.info(
        "[adobe-v2] B15(API assignments): removed %d product assignments for admin",
        productIds.length
      );
      return { success: true };
    }

    // Reconcile: nếu API báo lỗi nhưng admin thực tế đã không còn product thì coi là thành công.
    const refreshed = await fetchUsersViaApi(page, { orgToken });
    const refreshedAdmin = (refreshed.users || []).find(
      (u) => String(u?.email || "").trim().toLowerCase() === email
    );
    const remaining = new Set(toProductIdList(refreshedAdmin));
    const unresolved = failed.filter((f) => remaining.has(f.productId));
    if (unresolved.length === 0) {
      logger.info(
        "[adobe-v2] B15(API assignments): patch had errors but admin now has no target products; treat success"
      );
      return { success: true };
    }

    const reason = unresolved
      .map((x) => `${x.productId}:${x.reason}`)
      .slice(0, 5)
      .join(",");
    logger.warn(
      "[adobe-v2] B15(API assignments): unresolved failures=%d (%s)",
      unresolved.length,
      reason
    );
    return { success: false, error: `remove_admin_product_failed:${reason}` };
  } catch (err) {
    logger.error("[adobe-v2] B15(API assignments) error: %s", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  runB15RemoveProductFromAdmin,
};
