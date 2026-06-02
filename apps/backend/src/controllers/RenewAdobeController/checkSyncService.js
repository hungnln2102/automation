const { db } = require("../../db");
const { TABLE, COLS } = require("./accountTable");
const { resolveLisenceCount, userCountDbValue, withAdobeSlotsUsedInAlertConfig } = require("./usersSnapshotUtils");

function buildCheckUpdatePayload({ scrapedData = {}, savedCookies = null } = {}) {
  let licenseForUserCount = resolveLisenceCount({
    explicit: scrapedData.contractActiveLicenseCount,
    alertConfig: savedCookies,
  });

  const payload = {
    [COLS.ORG_NAME]: scrapedData.orgName ?? null,
    [COLS.LICENSE_STATUS]: scrapedData.licenseStatus ?? "unknown",
    [COLS.LAST_CHECKED]: new Date(),
  };

  if (Array.isArray(scrapedData.manageTeamMembers)) {
    licenseForUserCount = resolveLisenceCount({
      explicit: scrapedData.contractActiveLicenseCount,
      usersSnapshot: scrapedData.manageTeamMembers,
      alertConfig: savedCookies,
    });
  }

  payload[COLS.USER_COUNT] = userCountDbValue(
    licenseForUserCount,
    Number.isFinite(scrapedData.userCount) ? scrapedData.userCount : 0
  );
  if (scrapedData.urlAccess && COLS.URL_ACCESS) {
    payload[COLS.URL_ACCESS] = scrapedData.urlAccess;
  }
  if (COLS.ALERT_CONFIG && savedCookies) {
    payload[COLS.ALERT_CONFIG] = Array.isArray(scrapedData.manageTeamMembers)
      ? withAdobeSlotsUsedInAlertConfig(savedCookies, scrapedData.manageTeamMembers)
      : savedCookies;
  }

  if (COLS.ID_PRODUCT) {
    const hasIdProduct = Object.prototype.hasOwnProperty.call(
      scrapedData,
      "id_product"
    );
    if (hasIdProduct) {
      const raw = scrapedData.id_product;
      const s = raw != null ? String(raw).trim() : "";
      payload[COLS.ID_PRODUCT] = s !== "" ? s : null;
    }
  }

  if (COLS.ADOBE_ORG_ID) {
    const orgRaw = scrapedData.adobe_org_id;
    if (orgRaw != null) {
      const oid = String(orgRaw).trim();
      if (oid !== "") {
        payload[COLS.ADOBE_ORG_ID] = oid;
      }
    }
  }

  return payload;
}

async function persistCheckResult(accountId, { scrapedData = {}, savedCookies = null } = {}) {
  const updatePayload = buildCheckUpdatePayload({ scrapedData, savedCookies });
  await db(TABLE).where(COLS.ID, accountId).update(updatePayload);
  return updatePayload;
}

module.exports = {
  buildCheckUpdatePayload,
  persistCheckResult,
};
