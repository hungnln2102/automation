/**
 * Xóa user khỏi Adobe (V2), gỡ khỏi list_user, rồi chạy check để cập nhật admin + reconcile còn lại.
 */

const { db } = require("../../db");
const logger = require("../../utils/logger");
const adobeRenewV2 = require("../../services/renew-adobe/adobe-renew-v2");
const { TABLE, COLS } = require("./accountTable");
const {
  mergeRenewAdobeAlertConfig,
  resolveAccountSeatLimit,
} = require("./usersSnapshotUtils");
const {
  syncMappingAndUpsertTracking,
  runCheckForAccountId,
} = require("./checkAccounts");
const { persistCheckResult } = require("./checkSyncService");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");

const TRACK_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const TRACK_COLS = RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.COLS;

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

const runAutoDeleteUsers = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, error: "ID không hợp lệ." });
  }

  const userEmails = req.body?.userEmails;
  const list = Array.isArray(userEmails)
    ? userEmails
    : userEmails
      ? [userEmails]
      : [];
  const normalized = list.map((email) => String(email).trim()).filter(Boolean);

  if (normalized.length === 0) {
    return res.status(400).json({ success: false, error: "Thiếu userEmails." });
  }

  try {
    const account = await db(TABLE).where(COLS.ID, id).first();
    if (!account) {
      return res.status(404).json({ success: false, error: "Không tìm thấy tài khoản." });
    }

    const email = account[COLS.EMAIL];
    const password = account[COLS.PASSWORD_ENC] || "";
    const mailBackupId = null;
    const otpSource =
      COLS.OTP_SOURCE && account[COLS.OTP_SOURCE]
        ? String(account[COLS.OTP_SOURCE]).trim().toLowerCase()
        : "imap";

    logger.info("[renew-adobe] Auto-delete users (Adobe + list_user)", {
      id,
      count: normalized.length,
    });

    const result = await adobeRenewV2.autoDeleteUsers(email, password, normalized, {
      savedCookiesFromDb: COLS.ALERT_CONFIG ? account[COLS.ALERT_CONFIG] : null,
      mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
      otpSource,
    });

    if (result.savedCookies && COLS.ALERT_CONFIG) {
      await db(TABLE).where(COLS.ID, id).update({
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

    /** deleteUsersV2 đã gọi users API snapshot; không cần mở lại luồng check đầy đủ */
    try {
      const forceFullAfterDelete =
        String(process.env.ADOBE_POST_DELETE_FULL_CHECK || "").trim() === "1";
      const canLightPersist =
        !forceFullAfterDelete &&
        result.deleted.length > 0 &&
        result.snapshot &&
        Array.isArray(result.snapshot.manageTeamMembers);

      if (canLightPersist) {
        const accountAfter = await db(TABLE).where(COLS.ID, id).first();
        if (!accountAfter) {
          logger.warn("[renew-adobe] post-delete persist: không tìm thấy account id=%s", id);
        } else {
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
          await persistCheckResult(id, {
            scrapedData,
            savedCookies: COLS.ALERT_CONFIG ? accountAfter[COLS.ALERT_CONFIG] : null,
          });
          await syncMappingAndUpsertTracking(id, scrapedData, true);
          logger.info(
            "[renew-adobe] Sau delete: đồng bộ DB/list_user từ snapshot đã có (không Playwright check)."
          );
        }
      } else if (
        forceFullAfterDelete ||
        (result.deleted.length > 0 &&
          !(
            result.snapshot &&
            Array.isArray(result.snapshot.manageTeamMembers)
          ))
      ) {
        await runCheckForAccountId(id);
      }
    } catch (checkErr) {
      logger.warn("[renew-adobe] Đồng bộ sau auto-delete thất bại: %s", checkErr.message);
    }

    return res.json({
      success: true,
      message: `Đã xử lý: ${result.deleted.length} xóa thành công, ${result.failed.length} lỗi.`,
      deleted: result.deleted,
      failed: result.failed,
      list_user_removed: listUserRemoved,
    });
  } catch (err) {
    logger.error("[renew-adobe] Auto-delete users failed", { id, error: err.message });
    return res.status(500).json({
      success: false,
      error: err.message || "Lỗi khi xóa user.",
    });
  }
};

module.exports = { runAutoDeleteUsers };
