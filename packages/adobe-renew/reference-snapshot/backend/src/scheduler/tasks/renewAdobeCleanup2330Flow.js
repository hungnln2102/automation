const logger = require("../../utils/logger");
const { db } = require("../../db");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");
const adobeRenewV2 = require("../../services/renew-adobe/adobe-renew-v2");
const { runCheckForAccountId } = require("../../controllers/RenewAdobeController");
const { runCheckAllAccountsFlow } = require("../../controllers/RenewAdobeController/autoAssign");
const { notifyWarn } = require("../../utils/telegramErrorNotifier");
const {
  startJobRun,
  setCounter,
  addCounter,
  finishJobRun,
} = require("./shared/jobRunLogger");
const {
  resolveLisenceCount,
  mergeRenewAdobeAlertConfig,
  userCountDbValue,
} = require("../../controllers/RenewAdobeController/usersSnapshotUtils");
const { getMapAccountIdToUserEmailsFor2330Cleanup } = require("../../services/renew-adobe/orderUserTrackingService");

const ACCOUNT_TABLE = tableName(RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE, SCHEMA_RENEW_ADOBE);
const ACCOUNT_COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

const MAP_SCHEMA = RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING;
const MAP_TABLE = tableName(MAP_SCHEMA.TABLE, SCHEMA_RENEW_ADOBE);
const MAP_COLS = MAP_SCHEMA.COLS;

async function retryOnce(taskName, handler) {
  try {
    return await handler(1);
  } catch (firstError) {
    logger.warn("[CRON][cleanup-23-30] %s failed attempt 1: %s", taskName, firstError.message);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return handler(2);
  }
}

/**
 * B1: Quét order_user_tracking + order_list (bổ sung) → chỉ cặp (đơn, email) khớp mapping.
 * B2: Map đã group theo admin (adobe_account_id).
 * (B3–B4) Mỗi admin: mở session / autoDeleteUsers theo list email đó.
 */
async function runRenewAdobeCleanup2330Flow({
  trigger = "cron",
  runCheckBeforeCleanup = true,
} = {}) {
  const jobRun = startJobRun("renew-adobe-cleanup-23-30", {
    trigger,
    runCheckBeforeCleanup,
  });
  setCounter(jobRun, "checked_accounts", 0);
  setCounter(jobRun, "check_failed_accounts", 0);
  setCounter(jobRun, "users_to_remove", 0);
  setCounter(jobRun, "users_removed", 0);
  setCounter(jobRun, "failed_users", 0);
  setCounter(jobRun, "failed_accounts", 0);

  let checkResult = null;
  if (runCheckBeforeCleanup) {
    checkResult = await runCheckAllAccountsFlow({
      runCheckForAccountId,
      includeAutoAssign: false,
      logPrefix: "[CRON][23:30][check-before-cleanup]",
    });
    setCounter(jobRun, "checked_accounts", Number(checkResult.completed || 0));
    setCounter(jobRun, "check_failed_accounts", Number(checkResult.failed || 0));
  }

  let removeByAdmin = new Map();
  try {
    removeByAdmin = await getMapAccountIdToUserEmailsFor2330Cleanup();
  } catch (e) {
    logger.error(
      "[CRON][cleanup-23-30] getMapAccountIdToUserEmailsFor2330Cleanup failed: %s",
      e.message
    );
    throw e;
  }

  const targetAccountIds = [...removeByAdmin.keys()].filter(
    (id) => Number.isFinite(Number(id)) && Number(id) > 0
  );
  if (targetAccountIds.length === 0) {
    logger.info(
      "[CRON][cleanup-23-30] Không có đơn hết hạn (tracking/order + mapping) — bỏ qua xóa user trên Adobe."
    );
    const summary = {
      checkResult,
      usersToRemove: 0,
      usersRemoved: 0,
      failedUsers: 0,
      failedAccounts: [],
    };
    finishJobRun(jobRun);
    return summary;
  }

  const accounts = await db(ACCOUNT_TABLE)
    .select(
      ACCOUNT_COLS.ID,
      ACCOUNT_COLS.EMAIL,
      ACCOUNT_COLS.PASSWORD_ENC,
      ACCOUNT_COLS.IS_ACTIVE,
      ACCOUNT_COLS.ALERT_CONFIG,
      ACCOUNT_COLS.MAIL_BACKUP_ID,
      ...(ACCOUNT_COLS.ID_PRODUCT ? [ACCOUNT_COLS.ID_PRODUCT] : [])
    )
    .whereIn(ACCOUNT_COLS.ID, targetAccountIds)
    .where(ACCOUNT_COLS.IS_ACTIVE, true);

  const byId = new Map(accounts.map((a) => [Number(a[ACCOUNT_COLS.ID]), a]));
  const failedAccounts = [];

  for (const accountId of targetAccountIds) {
    const account = byId.get(Number(accountId));
    if (!account) {
      logger.warn(
        "[CRON][cleanup-23-30] Bỏ qua adobe_account_id=%s (không tìm thấy tài khoản active trong DB).",
        accountId
      );
      continue;
    }

    const adminEmail = (account[ACCOUNT_COLS.EMAIL] || "").toLowerCase().trim();
    const raw = removeByAdmin.get(Number(accountId)) || new Set();
    const toDelete = [...raw]
      .map((e) => String(e || "").toLowerCase().trim())
      .filter((e) => e && e !== adminEmail);

    if (toDelete.length === 0) continue;

    addCounter(jobRun, "users_to_remove", toDelete.length);
    logger.info(
      "[CRON][cleanup-23-30] admin id=%s email=%s → xóa %d user hết hạn (B3–B4).",
      account[ACCOUNT_COLS.ID],
      account[ACCOUNT_COLS.EMAIL],
      toDelete.length
    );

    try {
      const password = account[ACCOUNT_COLS.PASSWORD_ENC] || "";
      if (!password) throw new Error("Thiếu password_encrypted");

      const mailBackupId = account[ACCOUNT_COLS.MAIL_BACKUP_ID] != null
        ? Number(account[ACCOUNT_COLS.MAIL_BACKUP_ID])
        : null;
      const deleteResult = await retryOnce(
        `autoDeleteUsers(account=${account[ACCOUNT_COLS.ID]})`,
        async () =>
          adobeRenewV2.autoDeleteUsers(account[ACCOUNT_COLS.EMAIL], password, toDelete, {
            savedCookiesFromDb: account[ACCOUNT_COLS.ALERT_CONFIG] || null,
            mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
          })
      );

      addCounter(jobRun, "users_removed", Number(deleteResult.deleted?.length || 0));
      addCounter(jobRun, "failed_users", Number(deleteResult.failed?.length || 0));

      if (Array.isArray(deleteResult.deleted) && deleteResult.deleted.length > 0) {
        const deletedLower = deleteResult.deleted.map((email) => String(email || "").toLowerCase());
        await db(MAP_TABLE)
          .whereIn(db.raw(`LOWER(${MAP_COLS.USER_EMAIL})`), deletedLower)
          .andWhere(MAP_COLS.ADOBE_ACCOUNT_ID, account[ACCOUNT_COLS.ID])
          .update({
            [MAP_COLS.PRODUCT]: false,
            [MAP_COLS.UPDATED_AT]: new Date(),
          });
      }

      if (deleteResult.savedCookies) {
        await db(ACCOUNT_TABLE)
          .where(ACCOUNT_COLS.ID, account[ACCOUNT_COLS.ID])
          .update({
            [ACCOUNT_COLS.ALERT_CONFIG]: mergeRenewAdobeAlertConfig(
              account[ACCOUNT_COLS.ALERT_CONFIG],
              deleteResult.savedCookies,
              null
            ),
          });
      }

      if (deleteResult.snapshot && Array.isArray(deleteResult.snapshot.manageTeamMembers)) {
        const lisencecount = resolveLisenceCount({
          usersSnapshot: deleteResult.snapshot.manageTeamMembers,
          alertConfig: account[ACCOUNT_COLS.ALERT_CONFIG],
        });
        await db(ACCOUNT_TABLE)
          .where(ACCOUNT_COLS.ID, account[ACCOUNT_COLS.ID])
          .update({
            ...(deleteResult.snapshot.orgName != null && {
              [ACCOUNT_COLS.ORG_NAME]: deleteResult.snapshot.orgName,
            }),
            ...(deleteResult.snapshot.licenseStatus != null && {
              [ACCOUNT_COLS.LICENSE_STATUS]: deleteResult.snapshot.licenseStatus,
            }),
            [ACCOUNT_COLS.USER_COUNT]: userCountDbValue(
              lisencecount,
              deleteResult.snapshot.manageTeamMembers.length
            ),
          });
      } else {
        await runCheckForAccountId(account[ACCOUNT_COLS.ID]).catch((error) => {
          logger.warn(
            "[CRON][cleanup-23-30] runCheckForAccountId(%s) failed: %s",
            account[ACCOUNT_COLS.ID],
            error.message
          );
        });
      }
    } catch (error) {
      addCounter(jobRun, "failed_accounts", 1);
      failedAccounts.push({
        accountId: account[ACCOUNT_COLS.ID],
        accountEmail: account[ACCOUNT_COLS.EMAIL],
        error: error.message,
      });
      logger.error(
        "[CRON][cleanup-23-30] account=%s (%s) failed: %s",
        account[ACCOUNT_COLS.ID],
        account[ACCOUNT_COLS.EMAIL],
        error.message
      );
    }
  }

  const summary = {
    checkResult,
    usersToRemove: Number(jobRun.counters.users_to_remove || 0),
    usersRemoved: Number(jobRun.counters.users_removed || 0),
    failedUsers: Number(jobRun.counters.failed_users || 0),
    failedAccounts,
  };

  if (summary.failedUsers > 0 || summary.failedAccounts.length > 0) {
    notifyWarn({
      source: "backend",
      message:
        `[CRON][cleanup-23-30] trigger=${trigger} users_to_remove=${summary.usersToRemove}, ` +
        `users_removed=${summary.usersRemoved}, failed_users=${summary.failedUsers}, ` +
        `failed_accounts=${summary.failedAccounts.length}`,
    });
  }

  finishJobRun(jobRun);
  return summary;
}

module.exports = {
  runRenewAdobeCleanup2330Flow,
};
