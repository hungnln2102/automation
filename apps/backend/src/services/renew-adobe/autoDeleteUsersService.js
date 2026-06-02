/**
 * Xóa user khỏi Adobe (V2), gỡ khỏi list_user, đồng bộ snapshot admin.
 * Dùng chung cho API auto-delete và cron cleanup user hết hạn.
 */

const { db } = require("../../db");
const logger = require("../../utils/logger");
const adobeRenewV2 = require("./adobe-renew-v2");
const { TABLE, COLS } = require("../../controllers/RenewAdobeController/accountTable");
const {
  mergeRenewAdobeAlertConfig,
  resolveAccountSeatLimit,
} = require("../../controllers/RenewAdobeController/usersSnapshotUtils");
const {
  syncMappingAndUpsertTracking,
  runCheckForAccountId,
} = require("../../controllers/RenewAdobeController/checkAccounts");
const { persistCheckResult } = require("../../controllers/RenewAdobeController/checkSyncService");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");

const TRACK_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const { resolveAdminOtpRuntimeOptions } = require("./adminOtpOptions");

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/** Xóa dòng list_user khớp email (và org admin nếu có) — không đụng user cùng email org khác. */
async function deleteListUserRowsForEmails(adminOrgName, emailsNormalized) {
  if (!emailsNormalized.length) return 0;
  const orgKey = String(adminOrgName ?? "")
    .trim()
    .toLowerCase();
  let q = db(TRACK_TABLE).whereIn(TRACK_COLS.ACCOUNT, emailsNormalized);
  if (orgKey) {
    q = q.whereRaw(`lower(btrim(COALESCE(${TRACK_COLS.ORG_NAME}::text, ''))) = ?`, [
      orgKey,
    ]);
  }
  return q.delete();
}

/**
 * @param {number} accountId
 * @param {string[]} userEmails
 * @returns {Promise<{ deleted: string[], failed: string[], listUserRemoved: number }>}
 */
async function autoDeleteUsersForAccountId(accountId, userEmails) {
  const normalized = (Array.isArray(userEmails) ? userEmails : [])
    .map((email) => String(email).trim())
    .filter(Boolean);

  if (!normalized.length) {
    return { deleted: [], failed: [], listUserRemoved: 0 };
  }

  const account = await db(TABLE).where(COLS.ID, accountId).first();
  if (!account) {
    throw new Error(`Không tìm thấy tài khoản admin id=${accountId}.`);
  }

  const email = account[COLS.EMAIL];
  const password = String(account[COLS.PASSWORD_ENC] || "").trim();
  const otpOpts = resolveAdminOtpRuntimeOptions(account);

  logger.info("[renew-adobe] Auto-delete users (Adobe + list_user)", {
    accountId,
    count: normalized.length,
  });

  const result = await adobeRenewV2.autoDeleteUsers(email, password, normalized, {
    savedCookiesFromDb: COLS.ALERT_CONFIG ? account[COLS.ALERT_CONFIG] : null,
    ...otpOpts,
  });

  if (result.savedCookies && COLS.ALERT_CONFIG) {
    await db(TABLE).where(COLS.ID, accountId).update({
      [COLS.ALERT_CONFIG]: mergeRenewAdobeAlertConfig(
        account[COLS.ALERT_CONFIG],
        result.savedCookies,
        null
      ),
    });
  }

  const orgName = account[COLS.ORG_NAME] || null;
  const deletedLower = (result.deleted || []).map(normalizeEmail).filter(Boolean);
  const listUserRemoved =
    deletedLower.length > 0
      ? await deleteListUserRowsForEmails(orgName, deletedLower)
      : 0;

  logger.info(
    "[renew-adobe] Đã xóa %s dòng list_user (chỉ email Adobe xóa OK: %s)",
    listUserRemoved,
    deletedLower.join(",")
  );

  try {
    const forceFullAfterDelete =
      String(process.env.ADOBE_POST_DELETE_FULL_CHECK || "").trim() === "1";
    const canLightPersist =
      !forceFullAfterDelete &&
      result.deleted.length > 0 &&
      result.snapshot &&
      Array.isArray(result.snapshot.manageTeamMembers);

    if (canLightPersist) {
      const accountAfter = await db(TABLE).where(COLS.ID, accountId).first();
      if (accountAfter) {
        const members = result.snapshot.manageTeamMembers;
        const capRaw = resolveAccountSeatLimit(accountAfter);
        const contractCap =
          Number.isFinite(Number(capRaw)) && Number(capRaw) > 0 ? Number(capRaw) : null;
        const scrapedData = {
          orgName: accountAfter[COLS.ORG_NAME] ?? null,
          licenseStatus: accountAfter[COLS.LICENSE_STATUS] ?? "unknown",
          userCount: members.length,
          manageTeamMembers: members,
          contractActiveLicenseCount: contractCap ?? 0,
          adobe_org_id:
            COLS.ADOBE_ORG_ID ? accountAfter[COLS.ADOBE_ORG_ID] ?? null : null,
          urlAccess:
            COLS.URL_ACCESS && accountAfter[COLS.URL_ACCESS]
              ? String(accountAfter[COLS.URL_ACCESS]).trim() || null
              : null,
          id_product:
            COLS.ID_PRODUCT && accountAfter[COLS.ID_PRODUCT] != null
              ? String(accountAfter[COLS.ID_PRODUCT]).trim() || null
              : null,
        };
        await persistCheckResult(accountId, {
          scrapedData,
          savedCookies: COLS.ALERT_CONFIG ? accountAfter[COLS.ALERT_CONFIG] : null,
        });
        await syncMappingAndUpsertTracking(accountId, scrapedData, true);
        logger.info(
          "[renew-adobe] Sau delete: đồng bộ DB/list_user từ snapshot đã có (không Playwright check)."
        );
      }
    } else if (
      forceFullAfterDelete ||
      (result.deleted.length > 0 &&
        !(result.snapshot && Array.isArray(result.snapshot.manageTeamMembers)))
    ) {
      await runCheckForAccountId(accountId);
    }
  } catch (checkErr) {
    logger.warn("[renew-adobe] Đồng bộ sau auto-delete thất bại: %s", checkErr.message);
  }

  return {
    deleted: result.deleted || [],
    failed: result.failed || [],
    listUserRemoved,
  };
}

module.exports = {
  autoDeleteUsersForAccountId,
  deleteListUserRowsForEmails,
  normalizeEmail,
};
