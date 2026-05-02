/**
 * Xóa user trên Adobe + mapping, rồi xóa bản ghi accounts_admin khi tài khoản không còn gói (license ≠ Paid).
 * Dùng chung cho job cron và luồng Check All.
 */

const logger = require("../../utils/logger");
const { db } = require("../../db");
const adobeRenewV2 = require("./adobe-renew-v2");
const { removeMappingsForAccount } = require("../userAccountMappingService");
const { TABLE, COLS } = require("../../controllers/RenewAdobeController/accountTable");
const {
  removeProfileDirForEmail,
} = require("./adobe-renew-v2/shared/profileSession");
const {
  upsertRenewAdobeOrderUserTrackingForOrderIds,
} = require("./orderUserTrackingService");
/**
 * @param {object} accountRow — đủ cột: id, email, password_enc, mail_backup_id?, alert_config?
 * @param {{ logPrefix?: string }} [options]
 * @returns {Promise<{ emailsForReassign: string[]; deletedFromDb: boolean }>}
 */
async function purgeAndDeleteNoLicenseAdobeAdminAccount(
  accountRow,
  { logPrefix = "[renew-adobe-purge]" } = {}
) {
  const id = accountRow[COLS.ID];
  const email = (accountRow[COLS.EMAIL] || "").toString().trim();
  const password = (accountRow[COLS.PASSWORD_ENC] || "").toString().trim();
  const mailBackupId =
    accountRow[COLS.MAIL_BACKUP_ID] != null
      ? Number(accountRow[COLS.MAIL_BACKUP_ID])
      : null;
  const savedCookiesRaw = COLS.ALERT_CONFIG
    ? accountRow[COLS.ALERT_CONFIG]
    : null;
  const otpSource =
    COLS.OTP_SOURCE && accountRow[COLS.OTP_SOURCE]
      ? String(accountRow[COLS.OTP_SOURCE]).trim().toLowerCase()
      : "imap";

  const removedRows = await removeMappingsForAccount(id);
  let userEmails = removedRows.map((r) => r.user_email).filter(Boolean);

  const trackingOrderIds = [
    ...new Set(
      removedRows.map((r) => String(r.id_order ?? "").trim()).filter(Boolean)
    ),
  ];

  if (userEmails.length === 0) {
    logger.info(
      "%s Account %s (%s) hết gói, không có user — chỉ xóa bản ghi DB.",
      logPrefix,
      id,
      email
    );
  } else {
    logger.info(
      "%s Xóa %d user Adobe cho account %s (%s) (hết gói)",
      logPrefix,
      userEmails.length,
      id,
      email
    );
    try {
      await adobeRenewV2.autoDeleteUsers(email, password, userEmails, {
        savedCookiesFromDb: savedCookiesRaw,
        mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
        otpSource,
      });
    } catch (err) {
      logger.error(
        "%s autoDeleteUsers thất bại account %s: %s",
        logPrefix,
        id,
        err.message
      );
    }
  }

  let deletedFromDb = false;
  try {
    const removed = await db(TABLE).where(COLS.ID, id).del();
    deletedFromDb = removed > 0;
    if (deletedFromDb) {
      logger.info("%s Đã xóa accounts_admin id=%s (%s)", logPrefix, id, email);
      try {
        const profileClean = removeProfileDirForEmail(email);
        if (profileClean.removed) {
          logger.info(
            "%s Đã xóa profile local cho account %s (%s): %s",
            logPrefix,
            id,
            email,
            profileClean.profileDir
          );
        }
      } catch (profileErr) {
        logger.warn(
          "%s Xóa profile local thất bại cho account %s (%s): %s",
          logPrefix,
          id,
          email,
          profileErr.message
        );
      }
    }
  } catch (err) {
    logger.error(
      "%s Không xóa được accounts_admin id=%s: %s",
      logPrefix,
      id,
      err.message
    );
  }

  if (trackingOrderIds.length > 0) {
    await upsertRenewAdobeOrderUserTrackingForOrderIds(trackingOrderIds).catch((err) => {
      logger.warn("%s order_user_tracking: %s", logPrefix, err.message);
    });
  }

  return { emailsForReassign: userEmails, deletedFromDb };
}

module.exports = { purgeAndDeleteNoLicenseAdobeAdminAccount };
