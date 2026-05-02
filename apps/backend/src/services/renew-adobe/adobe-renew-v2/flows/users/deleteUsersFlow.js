const logger = require("../../../../../utils/logger");
const { ADMIN_CONSOLE_API_BASE, TIMEOUTS } = require("../../shared/constants");
const { fetchUsersViaApi } = require("../../shared/usersListApi");

async function captureAdobeApiHeaders(page, orgToken) {
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

function normalizePatchResult(deleteList, status, rawBody) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawBody || "null");
  } catch (_) {
    parsed = null;
  }

  if (!Array.isArray(parsed)) {
    if (status >= 200 && status < 300) {
      return { done: deleteList.map((x) => x.email), failed: [] };
    }
    return {
      done: [],
      failed: deleteList.map((x) => ({
        email: x.email,
        reason: `http_${status}`,
      })),
    };
  }

  const done = [];
  const failed = [];
  parsed.forEach((item, idx) => {
    const fallback = deleteList[idx] || null;
    const email = String(item?.request?.email || fallback?.email || "").trim().toLowerCase();
    if (!email) return;
    const code = Number(item?.responseCode);
    if (Number.isFinite(code) && code >= 200 && code < 300) {
      done.push(email);
      return;
    }
    failed.push({
      email,
      reason: String(item?.response?.errorCode || `http_${status}`),
    });
  });

  const touched = new Set([...done, ...failed.map((x) => x.email)]);
  for (const item of deleteList) {
    if (!touched.has(item.email)) {
      failed.push({ email: item.email, reason: "unknown_patch_result" });
    }
  }
  return { done, failed };
}

async function runDeleteUsersFlow(page, userEmails = [], options = {}) {
  const list = Array.isArray(userEmails)
    ? userEmails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)
    : [];

  if (list.length === 0) {
    return {
      success: false,
      done: [],
      failed: [],
      stoppedByPolicy: false,
    };
  }

  const usersResult = await fetchUsersViaApi(page);
  const emailToId = new Map();
  for (const user of usersResult.users || []) {
    const email = String(user?.email || "").trim().toLowerCase();
    const id = String(user?.id || "").trim();
    if (email && id && !emailToId.has(email)) {
      emailToId.set(email, id);
    }
  }

  const orgToken = usersResult.orgToken;
  const missing = [];
  const deleteList = [];
  for (const email of list) {
    const id = emailToId.get(email);
    if (!id) {
      missing.push({ email, reason: "user_not_found" });
      continue;
    }
    deleteList.push({ email, id });
  }

  if (deleteList.length === 0) {
    const stoppedOnlyByPolicy = options.stopOnError === true && missing.length > 0;
    return {
      success: !stoppedOnlyByPolicy,
      done: [],
      failed: missing,
      stoppedByPolicy: stoppedOnlyByPolicy,
    };
  }

  const headers = await captureAdobeApiHeaders(page, orgToken);
  const authorization = headers.authorization || headers.Authorization || "";
  const xApiKey = headers["x-api-key"] || headers["X-Api-Key"] || "";
  if (!authorization || !xApiKey) {
    const failed = [
      ...missing,
      ...deleteList.map((x) => ({ email: x.email, reason: "auth_headers_missing" })),
    ];
    return {
      success: false,
      done: [],
      failed,
      stoppedByPolicy: options.stopOnError === true && failed.length > 0,
    };
  }

  const payload = deleteList.map((item) => ({
    op: "remove",
    path: `/${item.id}`,
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
        authorization,
        "x-requested-with": headers["x-requested-with"] || "XMLHttpRequest",
        "x-api-key": xApiKey,
        "x-jil-feature": headers["x-jil-feature"] || "",
        "x-current-page": headers["x-current-page"] || "1",
        "x-page-size": headers["x-page-size"] || String(Math.max(deleteList.length, 10)),
        "x-next-page": headers["x-next-page"] || "",
        "x-request-id": headers["x-request-id"] || `renew-adobe-delete-${Date.now()}`,
      },
      data: payload,
      timeout: 30000,
    }
  );
  const status = apiResponse.status();
  const rawBody = await apiResponse.text().catch(() => "");
  const normalized = normalizePatchResult(deleteList, status, rawBody);
  logger.info(
    "[adobe-v2] runDeleteUsersFlow(API): status=%s done=%d failed=%d",
    status,
    normalized.done.length,
    normalized.failed.length
  );

  const allFailed = [...normalized.failed, ...missing];
  const stoppedByPolicy =
    options.stopOnError === true && allFailed.length > 0;

  return {
    success: normalized.done.length > 0 && !stoppedByPolicy,
    done: normalized.done,
    failed: allFailed,
    stoppedByPolicy,
  };
}

module.exports = {
  runDeleteUsersFlow,
};
