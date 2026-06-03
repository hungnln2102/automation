const { resolvePlaywrightProxyForAdminLogin, markProxyCheckResult } = require("../proxyPoolService");
const { db } = require("../../db");
const { TABLE, COLS } = require("../../controllers/RenewAdobeController/accountTable");

/** Proxy runtime options cho login Adobe admin. */
async function resolveAdminProxyRuntimeOptions(account) {
  return resolvePlaywrightProxyForAdminLogin(account);
}

async function resolveAdminProxyRuntimeOptionsByEmail(adminEmail) {
  const email = String(adminEmail || "").trim().toLowerCase();
  if (!email) {
    return resolvePlaywrightProxyForAdminLogin(null);
  }
  const account = await db(TABLE).whereRaw("LOWER(??) = ?", [COLS.EMAIL, email]).first();
  return resolvePlaywrightProxyForAdminLogin(account);
}

function isLikelyProxyNetworkError(message) {
  const lower = String(message || "").toLowerCase();
  if (/err_http2_protocol_error/.test(lower)) return false;
  return (
    /chrome-error|proxy|network|econnrefused|etimedout|enotfound|tunnel|407|502|503/.test(
      lower
    ) && !/incorrect password|otp|verification/.test(lower)
  );
}

async function markProxyDeadIfNetworkError(proxyId, errorMessage) {
  if (!proxyId || !isLikelyProxyNetworkError(errorMessage)) return false;
  await markProxyCheckResult(proxyId, { ok: false, error: errorMessage });
  return true;
}

module.exports = {
  resolveAdminProxyRuntimeOptions,
  resolveAdminProxyRuntimeOptionsByEmail,
  isLikelyProxyNetworkError,
  markProxyDeadIfNetworkError,
};
