const logger = require("../../../../../utils/logger");
const { TIMEOUTS, ADMIN_CONSOLE_API_BASE } = require("../../shared/constants");
const { fetchUsersViaApi } = require("../../shared/usersListApi");

const CREATE_USER_CONCURRENCY = (() => {
  const n = Number.parseInt(process.env.ADOBE_V2_CREATE_USER_CONCURRENCY || "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : 6;
})();

const MAX_PRODUCT_PATCH_PER_REQUEST = (() => {
  const n = Number.parseInt(process.env.ADOBE_V2_MAX_PRODUCT_PATCH_BATCH || "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 40;
})();

function hasProductId(user, productId) {
  return (
    user &&
    Array.isArray(user.products) &&
    user.products.some((p) => String(p?.id || p || "").trim() === productId)
  );
}

function extractOrgIdFromUrl(url) {
  const m = String(url || "").match(/\/([A-Fa-f0-9]{20,})@AdobeOrg/);
  return m ? m[1] : null;
}

async function captureAdobeApiHeaders(page, orgId) {
  const orgToken = `${orgId}@AdobeOrg`;
  const reqPromise = page.waitForRequest(
    (req) => {
      const url = req.url();
      if (!url.includes("bps-il.adobe.io/jil-api/v2/organizations/")) return false;
      if (!url.includes(orgToken)) return false;
      const method = req.method();
      return method === "GET" || method === "HEAD";
    },
    { timeout: TIMEOUTS.NAVIGATE || 20000 }
  );

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  const req = await reqPromise;
  return req.headers();
}

function normalizeBatchResult(userEmails, status, rawBody) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawBody || "null");
  } catch (_) {
    parsed = null;
  }

  if (!Array.isArray(parsed)) {
    if (status >= 200 && status < 300) {
      return {
        done: [...userEmails],
        failed: [],
      };
    }
    return {
      done: [],
      failed: userEmails.map((email) => ({
        email,
        reason: `http_${status}`,
      })),
    };
  }

  const done = [];
  const failed = [];

  parsed.forEach((item, idx) => {
    const fallbackEmail = userEmails[idx];
    const email = String(item?.request?.email || fallbackEmail || "").trim().toLowerCase();
    if (!email) return;

    const code = Number(item?.responseCode);
    if (Number.isFinite(code) && code >= 200 && code < 300) {
      done.push(email);
      return;
    }

    const errCode = String(item?.response?.errorCode || `http_${status}`);
    failed.push({ email, reason: errCode });
  });

  const touched = new Set([...done, ...failed.map((x) => x.email)]);
  for (const email of userEmails) {
    if (!touched.has(email)) {
      failed.push({ email, reason: "unknown_batch_result" });
    }
  }

  return { done, failed };
}

function extractUserIdFromAbpCreateBody(rawBody) {
  try {
    const parsed = JSON.parse(rawBody || "{}");
    return String(parsed?.id || "").trim() || null;
  } catch (_) {
    return null;
  }
}

function normalizeAbpReason(status, rawBody) {
  try {
    const parsed = JSON.parse(rawBody || "{}");
    const detail = String(parsed?.detail || "").trim();
    if (detail) return detail;
    const type = String(parsed?.type || "").trim();
    if (type) return type.split("/").pop() || `http_${status}`;
  } catch (_) {}
  return `http_${status}`;
}

function safeBodyPreview(rawBody, limit = 500) {
  const text = String(rawBody || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function extractApiErrorCode(rawBody) {
  try {
    const parsed = JSON.parse(rawBody || "{}");
    const code = String(parsed?.errorCode || parsed?.code || "").trim();
    return code || "";
  } catch (_) {
    return "";
  }
}

function isTrialAlreadyConsumedFromPatch(reason, rawBody) {
  if (String(reason || "").toLowerCase() === "trial_already_consumed") {
    return true;
  }
  if (String(extractApiErrorCode(rawBody) || "").toUpperCase() === "TRIAL_ALREADY_CONSUMED") {
    return true;
  }
  try {
    const parsed = JSON.parse(rawBody || "null");
    const arr = Array.isArray(parsed) ? parsed : [];
    for (const item of arr) {
      const c = String(item?.response?.errorCode || item?.errorCode || "").toUpperCase();
      if (c === "TRIAL_ALREADY_CONSUMED") {
        return true;
      }
    }
  } catch (_) {
    /* ignore */
  }
  if (String(rawBody || "").toLowerCase().includes("trial_already_consumed")) {
    return true;
  }
  return false;
}

async function resolveAssignableProductId(page, orgToken, headers, options = {}) {
  if (options.productId) return String(options.productId).trim();

  const url =
    `${ADMIN_CONSOLE_API_BASE}/jil-api/v2/organizations/${orgToken}/products/` +
    "?include_created_date=true&include_expired=true&include_groups_quantity=true" +
    "&include_inactive=false&include_license_activations=true&include_license_allocation_info=false" +
    "&includeAcquiredOfferIds=false&includeConfiguredProductArrangementId=false" +
    "&includeLegacyLSFields=false&license_group_limit=100&processing_instruction_codes=administration,license_data";

  const resp = await page.context().request.get(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      authorization: headers.authorization || headers.Authorization || "",
      "x-api-key": headers["x-api-key"] || headers["X-Api-Key"] || "",
      "x-requested-with": headers["x-requested-with"] || "XMLHttpRequest",
      "x-jil-feature": headers["x-jil-feature"] || "",
      origin: "https://adminconsole.adobe.com",
      referer: `https://adminconsole.adobe.com/${orgToken}/products`,
    },
    timeout: 30000,
  });
  const text = await resp.text().catch(() => "");
  if (!resp.ok()) {
    throw new Error(`products_api_fail_${resp.status()}: ${text.slice(0, 200)}`);
  }

  let list = [];
  try {
    const parsed = JSON.parse(text || "[]");
    list = Array.isArray(parsed) ? parsed : parsed?.items || parsed?.data || [];
  } catch (e) {
    throw new Error(`products_api_parse_fail: ${e.message}`);
  }

  const product =
    list.find((p) => String(p?.status || "").toLowerCase() !== "expired") ||
    list[0];
  const productId = String(product?.id || product?.productId || "").trim();
  if (!productId) throw new Error("product_id_missing");
  return productId;
}

async function createUserViaAbpApi(page, orgToken, email, headers) {
  const apiResponse = await page.context().request.post(
    `https://abpapi.adobe.io/abpapi/organizations/${orgToken}/users`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        origin: "https://www.adobe.com",
        referer: "https://www.adobe.com/",
        authorization: headers.authorization || headers.Authorization || "",
        "x-requested-with": headers["x-requested-with"] || "XMLHttpRequest",
        "x-api-key": headers["x-api-key"] || headers["X-Api-Key"] || "",
      },
      data: { email: { primary: email } },
      timeout: 30000,
    }
  );
  const status = apiResponse.status();
  const rawBody = await apiResponse.text().catch(() => "");
  if (!(status >= 200 && status < 300)) {
    logger.warn("[adobe-v2] createUserViaAbpApi failed", {
      email,
      orgToken,
      status,
      body: safeBodyPreview(rawBody),
    });
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    rawBody,
    userId: extractUserIdFromAbpCreateBody(rawBody),
    reason: normalizeAbpReason(status, rawBody),
  };
}

async function assignProductViaPatch(page, orgToken, userId, productId, headers) {
  const apiResponse = await page.context().request.fetch(
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
          headers["x-request-id"] || `renew-adobe-assign-${Date.now()}`,
      },
      data: [{ op: "add", path: `/${userId}/products/${productId}` }],
      timeout: 30000,
    }
  );
  const status = apiResponse.status();
  const rawBody = await apiResponse.text().catch(() => "");
  const patchParsed = normalizeBatchResult(["_one_"], status, rawBody);
  const apiErrorCode = extractApiErrorCode(rawBody);
  const patchedFailedReason = patchParsed.failed[0]?.reason || "";
  const oneFailedReason =
    apiErrorCode && (!patchedFailedReason || /^http_\d+$/i.test(patchedFailedReason))
      ? apiErrorCode.toLowerCase()
      : patchedFailedReason || `http_${status}`;
  if (!(patchParsed.failed.length === 0 && patchParsed.done.length > 0)) {
    if (isTrialAlreadyConsumedFromPatch(oneFailedReason, rawBody)) {
      logger.info("[adobe-v2] assignProductViaPatch: trial already consumed (bỏ qua Telegram / không cảnh báo): %s", userId);
    } else {
      logger.warn("[adobe-v2] assignProductViaPatch failed", {
        orgToken,
        userId,
        productId,
        status,
        reason: oneFailedReason,
        body: safeBodyPreview(rawBody),
      });
    }
  }
  return {
    ok: patchParsed.failed.length === 0 && patchParsed.done.length > 0,
    status,
    rawBody,
    reason: oneFailedReason,
  };
}

/**
 * Một lần PATCH nhiều { op: add, path: /:userId/products/:productId } — tránh gọi tuần từ từng user.
 */
async function assignProductBatchViaPatch(page, orgToken, items, productId, headers) {
  if (!items || items.length === 0) {
    return { status: 200, rawBody: "[]" };
  }
  const payload = items.map((item) => ({
    op: "add",
    path: `/${item.userId}/products/${productId}`,
  }));
  const apiResponse = await page.context().request.fetch(
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
        "x-page-size": String(Math.max(items.length, 10)),
        "x-next-page": "",
        "x-request-id": headers["x-request-id"] || `renew-adobe-assign-batch-${Date.now()}`,
      },
      data: payload,
      timeout: 60000,
    }
  );
  const status = apiResponse.status();
  const rawBody = await apiResponse.text().catch(() => "");
  return { status, rawBody };
}

async function resolveUserIdOrFail(page, orgToken, orgId, email, headers, preUser) {
  let userId = String(preUser?.id || "").trim() || null;
  if (userId) {
    return { userId, createReason: null };
  }
  const createRes = await createUserViaAbpApi(page, orgToken, email, headers);
  if (createRes.ok) {
    return { userId: createRes.userId || null, createReason: null };
  }
  const refreshed = await fetchUsersViaApi(page, { orgId });
  const existed = (refreshed.users || []).find(
    (u) => String(u?.email || "").trim().toLowerCase() === email
  );
  if (existed?.id) {
    logger.info(
      "[adobe-v2] runAddUsersFlow(API): user already exists after ABP error (%s): %s",
      createRes.reason,
      email
    );
    return { userId: String(existed.id), createReason: null };
  }
  return { userId: null, createReason: `create_user_failed:${createRes.reason}` };
}

async function applyAssignFallback(
  page,
  orgId,
  orgToken,
  email,
  userId,
  productId,
  headers
) {
  const assignRes = await assignProductViaPatch(page, orgToken, userId, productId, headers);
  if (assignRes.ok) {
    return { kind: "done" };
  }
  if (String(assignRes.reason || "").toLowerCase() === "trial_already_consumed") {
    logger.info(
      "[adobe-v2] runAddUsersFlow(API): user added but product not assigned (trial already consumed): %s",
      email
    );
    return { kind: "noProduct" };
  }
  const refreshed = await fetchUsersViaApi(page, { orgId });
  const existed = (refreshed.users || []).find(
    (u) => String(u?.email || "").trim().toLowerCase() === email
  );
  if (hasProductId(existed, productId)) {
    logger.info(
      "[adobe-v2] runAddUsersFlow(API): assign returned error but product already present, treat success: %s",
      email
    );
    return { kind: "done" };
  }
  return { kind: "unassigned", reason: `assign_product_failed:${assignRes.reason}` };
}

async function runAddUsersFlow(page, userEmails = [], options = {}) {
  const list = Array.isArray(userEmails)
    ? userEmails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (list.length === 0) {
    return {
      success: false,
      done: [],
      failed: [],
      unassigned: [],
      stoppedByPolicy: false,
    };
  }

  const orgId = extractOrgIdFromUrl(page.url()) || options.orgId || null;
  if (!orgId) {
    return {
      success: false,
      done: [],
      failed: list.map((email) => ({ email, reason: "org_id_missing" })),
      unassigned: [],
      stoppedByPolicy: false,
    };
  }

  const preJil = options.precapturedJilHeaders;
  const usePreJil =
    preJil &&
    (preJil.authorization || preJil.Authorization) &&
    (preJil["x-api-key"] || preJil["X-Api-Key"]);
  let headers;
  if (usePreJil) {
    headers = preJil;
    logger.info("[adobe-v2] runAddUsersFlow: dùng precaptured JIL headers (bỏ 1x reload captureAdobe + bớt capture trong fetchUsersViaApi)");
  } else {
    headers = await captureAdobeApiHeaders(page, orgId);
  }
  const authorization = headers.authorization || headers.Authorization || "";
  const xApiKey = headers["x-api-key"] || headers["X-Api-Key"] || "";

  if (!authorization || !xApiKey) {
    logger.warn("[adobe-v2] runAddUsersFlow(API): thiếu authorization hoặc x-api-key", {
      orgId,
      hasAuthorization: !!authorization,
      hasXApiKey: !!xApiKey,
    });
    return {
      success: false,
      done: [],
      failed: list.map((email) => ({ email, reason: "auth_headers_missing" })),
      unassigned: [],
      stoppedByPolicy: false,
    };
  }

  const orgToken = `${orgId}@AdobeOrg`;
  const productId = await resolveAssignableProductId(page, orgToken, headers, options);
  const fetchOpts = { orgId, ...(usePreJil ? { reusableJilHeaders: preJil } : {}) };
  let usersSnapshot = await fetchUsersViaApi(page, fetchOpts);
  const buildEmailToUser = (snap) =>
    new Map(
      (snap.users || [])
        .filter((u) => u?.email)
        .map((u) => [String(u.email).trim().toLowerCase(), u])
    );
  let emailToUser = buildEmailToUser(usersSnapshot);

  const done = [];
  const noProduct = [];
  const failed = [];
  const unassigned = [];

  const toCreate = list.filter((e) => !emailToUser.has(e));
  for (let i = 0; i < toCreate.length; i += CREATE_USER_CONCURRENCY) {
    const slice = toCreate.slice(i, i + CREATE_USER_CONCURRENCY);
    await Promise.all(
      slice.map((email) => createUserViaAbpApi(page, orgToken, email, headers))
    );
  }

  usersSnapshot = await fetchUsersViaApi(page, fetchOpts);
  emailToUser = buildEmailToUser(usersSnapshot);

  for (const email of list) {
    if (emailToUser.has(email)) {
      continue;
    }
    const r = await resolveUserIdOrFail(page, orgToken, orgId, email, headers, null);
    if (r.userId) {
      usersSnapshot = await fetchUsersViaApi(page, fetchOpts);
      emailToUser = buildEmailToUser(usersSnapshot);
    } else {
      failed.push({ email, reason: r.createReason || "create_failed" });
    }
  }

  const needAssign = [];
  for (const email of list) {
    if (failed.some((f) => f.email === email)) {
      continue;
    }
    const u = emailToUser.get(email);
    if (!u) {
      failed.push({ email, reason: "user_not_found_after_create" });
      continue;
    }
    if (hasProductId(u, productId)) {
      done.push(email);
      continue;
    }
    const uid = String(u.id || "").trim();
    if (!uid) {
      failed.push({ email, reason: "user_id_missing" });
      continue;
    }
    needAssign.push({ email, userId: uid });
  }

  for (let i = 0; i < needAssign.length; i += MAX_PRODUCT_PATCH_PER_REQUEST) {
    const batch = needAssign.slice(i, i + MAX_PRODUCT_PATCH_PER_REQUEST);
    const { status, rawBody } = await assignProductBatchViaPatch(
      page,
      orgToken,
      batch,
      productId,
      headers
    );
    const emails = batch.map((b) => b.email);
    const norm = normalizeBatchResult(emails, status, rawBody);
    for (const email of norm.done) {
      done.push(email);
    }
    for (const f of norm.failed) {
      const b = batch.find((x) => x.email === f.email) || null;
      if (!b) {
        failed.push(f);
        continue;
      }
      const fb = await applyAssignFallback(
        page,
        orgId,
        orgToken,
        f.email,
        b.userId,
        productId,
        headers
      );
      if (fb.kind === "done") {
        done.push(f.email);
      } else if (fb.kind === "noProduct") {
        done.push(f.email);
        noProduct.push(f.email);
      } else {
        done.push(f.email);
        unassigned.push({ email: f.email, reason: fb.reason || f.reason });
      }
    }
  }

  const uniqueDone = [...new Set(done)];

  logger.info(
    "[adobe-v2] runAddUsersFlow(API): org=%s product=%s done=%d noProduct=%d failed=%d unassigned=%d (maxPatch=%d createConcurrency=%d)",
    orgToken,
    productId,
    uniqueDone.length,
    noProduct.length,
    failed.length,
    unassigned.length,
    MAX_PRODUCT_PATCH_PER_REQUEST,
    CREATE_USER_CONCURRENCY
  );

  const stoppedByPolicy = options.stopOnError === true && failed.length > 0;

  return {
    success: uniqueDone.length > 0 && !stoppedByPolicy,
    done: uniqueDone,
    noProduct,
    failed,
    unassigned,
    stoppedByPolicy,
  };
}

module.exports = {
  runAddUsersFlow,
};
