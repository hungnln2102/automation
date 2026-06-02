/**
 * Xóa user list_user đã quá hạn (expired < hôm nay theo APP_TIMEZONE).
 * - Chưa add / chưa gán admin: xóa dòng list_user (giống nút Xóa trên UI).
 * - Đã gán Adobe: xóa trên Adobe + list_user (giống auto-delete API).
 */

const { db } = require("../../db");
const logger = require("../../utils/logger");
const { getSqlCurrentDate } = require("../../scheduler/config");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");
const { autoDeleteUsersForAccountId } = require("./autoDeleteUsersService");

const TRACK_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const TRACK_COLS = RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.COLS;
const ACC_TABLE = tableName(RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE, SCHEMA_RENEW_ADOBE);
const ACC_COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

const ACCOUNT_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotAddedStatus(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s.includes("chưa add") || s === "chua add";
}

function needsAdobeDelete(row) {
  if (isNotAddedStatus(row.status)) return false;
  const accountId = Number(row.adobe_account_id) || 0;
  return accountId > 0;
}

async function fetchExpiredListUsers() {
  return db({ t: TRACK_TABLE })
    .leftJoin({ acc: ACC_TABLE }, function joinAccountByOrgName() {
      this.on(
        db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`acc.${ACC_COLS.ORG_NAME}`]),
        "=",
        db.raw(`LOWER(TRIM(COALESCE(??, '')))`, [`t.${TRACK_COLS.ORG_NAME}`])
      )
        .andOn(db.raw(`TRIM(COALESCE(??, '')) <> ''`, [`acc.${ACC_COLS.ORG_NAME}`]))
        .andOn(db.raw(`TRIM(COALESCE(??, '')) <> ''`, [`t.${TRACK_COLS.ORG_NAME}`]));
    })
    .whereNotNull(`t.${TRACK_COLS.EXPIRED}`)
    .whereRaw(`t.${TRACK_COLS.EXPIRED} < ${getSqlCurrentDate()}`)
    .select(
      `t.${TRACK_COLS.ID} as id`,
      `t.${TRACK_COLS.ACCOUNT} as account`,
      `t.${TRACK_COLS.STATUS} as status`,
      `t.${TRACK_COLS.EXPIRED} as expired`,
      `acc.${ACC_COLS.ID} as adobe_account_id`
    )
    .orderBy(`t.${TRACK_COLS.ID}`, "asc");
}

/**
 * @param {string} [trigger]
 */
async function cleanupExpiredListUsers(trigger = "cron") {
  const rows = await fetchExpiredListUsers();
  if (!rows.length) {
    logger.info("[CRON] cleanupExpiredListUsers (%s): không có user hết hạn", trigger);
    return {
      success: true,
      trigger,
      scanned: 0,
      dbRemoved: 0,
      adobeDeleted: 0,
      adobeFailed: 0,
    };
  }

  logger.info("[CRON] cleanupExpiredListUsers (%s): tìm thấy %d user hết hạn", trigger, rows.length);

  const dbOnlyIds = [];
  const adobeByAccount = new Map();

  for (const row of rows) {
    const listUserId = Number(row.id);
    const accountEmail = String(row.account || "").trim().toLowerCase();
    if (!accountEmail || !Number.isFinite(listUserId)) continue;

    if (needsAdobeDelete(row)) {
      const accountId = Number(row.adobe_account_id);
      if (!adobeByAccount.has(accountId)) {
        adobeByAccount.set(accountId, []);
      }
      adobeByAccount.get(accountId).push(accountEmail);
    } else {
      dbOnlyIds.push(listUserId);
    }
  }

  let dbRemoved = 0;
  if (dbOnlyIds.length > 0) {
    dbRemoved = await db(TRACK_TABLE).whereIn(TRACK_COLS.ID, dbOnlyIds).del();
    logger.info(
      "[CRON] cleanupExpiredListUsers (%s): xóa %d/%d dòng list_user (chưa add / chưa gán Adobe)",
      trigger,
      dbRemoved,
      dbOnlyIds.length
    );
  }

  let adobeDeleted = 0;
  let adobeFailed = 0;
  let accountIndex = 0;

  for (const [accountId, emails] of adobeByAccount) {
    if (accountIndex > 0) {
      await sleep(ACCOUNT_DELAY_MS);
    }
    accountIndex += 1;

    try {
      const result = await autoDeleteUsersForAccountId(accountId, emails);
      adobeDeleted += result.deleted.length;
      adobeFailed += result.failed.length;
      logger.info(
        "[CRON] cleanupExpiredListUsers (%s): accountId=%s deleted=%d failed=%d",
        trigger,
        accountId,
        result.deleted.length,
        result.failed.length
      );
    } catch (err) {
      adobeFailed += emails.length;
      logger.error("[CRON] cleanupExpiredListUsers (%s): accountId=%s lỗi — %s", trigger, accountId, err.message);
    }
  }

  const summary = {
    success: true,
    trigger,
    scanned: rows.length,
    dbRemoved,
    adobeDeleted,
    adobeFailed,
  };

  logger.info("[CRON] cleanupExpiredListUsers (%s) hoàn thành: %j", trigger, summary);
  return summary;
}

module.exports = {
  cleanupExpiredListUsers,
  fetchExpiredListUsers,
  needsAdobeDelete,
};
