const { db } = require("../../db");
const logger = require("../../utils/logger");
const adobeRenewV2 = require("../../services/renew-adobe/adobe-renew-v2");
const {
  lookupAndRecordIfNeeded,
  getMappingCountsByAdobeAccountIds,
} = require("../../services/userAccountMappingService");
const {
  upsertRenewAdobeOrderUserTrackingForAccount,
} = require("../../services/renew-adobe/orderUserTrackingService");
const { TABLE, COLS, MAX_USERS_PER_ACCOUNT } = require("./accountTable");
const {
  resolveLisenceCount,
  mergeRenewAdobeAlertConfig,
  resolveAccountUserLimit,
  userCountDbValue,
} = require("./usersSnapshotUtils");

const runAddUsersBatch = async (req, res) => {
  const accountIdsRaw = req.body?.accountIds;
  const userEmailsRaw = req.body?.userEmails;
  const accountIds = Array.isArray(accountIdsRaw)
    ? accountIdsRaw.map((id) => parseInt(id, 10)).filter(Number.isFinite)
    : [];
  const userEmails = Array.isArray(userEmailsRaw)
    ? userEmailsRaw.map((email) => String(email).trim()).filter(Boolean)
    : [];

  if (userEmails.length === 0) {
    return res.status(400).json({ error: "Thiếu userEmails." });
  }

  try {
    let ordered;
    if (accountIds.length > 0) {
      const accounts = await db(TABLE)
        .whereIn(COLS.ID, accountIds)
        .select(
          COLS.ID,
          COLS.EMAIL,
          COLS.PASSWORD_ENC,
          COLS.USER_COUNT,
          COLS.ALERT_CONFIG,
          ...(COLS.OTP_SOURCE ? [COLS.OTP_SOURCE] : []),
          COLS.MAIL_BACKUP_ID,
          COLS.LICENSE_STATUS,
          ...(COLS.ID_PRODUCT ? [COLS.ID_PRODUCT] : [])
        );
      const countMap = await getMappingCountsByAdobeAccountIds(accountIds);
      const idToOrder = new Map(accountIds.map((id, idx) => [id, idx]));
      ordered = [...accounts]
        .sort(
          (a, b) =>
            (idToOrder.get(a[COLS.ID]) ?? 0) - (idToOrder.get(b[COLS.ID]) ?? 0)
        )
        .map((account) => ({
          ...account,
          _currentCount: countMap.get(Number(account[COLS.ID])) ?? 0,
          _userLimit: resolveAccountUserLimit(account, MAX_USERS_PER_ACCOUNT),
        }));
    } else {
      const allAccounts = await db(TABLE)
        .select(
          COLS.ID,
          COLS.EMAIL,
          COLS.PASSWORD_ENC,
          COLS.USER_COUNT,
          COLS.ALERT_CONFIG,
          ...(COLS.OTP_SOURCE ? [COLS.OTP_SOURCE] : []),
          COLS.MAIL_BACKUP_ID,
          COLS.LICENSE_STATUS,
          ...(COLS.ID_PRODUCT ? [COLS.ID_PRODUCT] : [])
        )
        .where(COLS.IS_ACTIVE, true)
        .orderBy(COLS.ID, "asc");

      const ids = allAccounts.map((a) => Number(a[COLS.ID])).filter((n) => n > 0);
      const countMap = await getMappingCountsByAdobeAccountIds(ids);

      ordered = allAccounts
        .filter((account) => {
          const licenseStatus = (account[COLS.LICENSE_STATUS] || "").toLowerCase();
          return licenseStatus !== "expired" && licenseStatus !== "unknown";
        })
        .map((account) => {
          const id = Number(account[COLS.ID]);
          return {
            ...account,
            _userLimit: resolveAccountUserLimit(account, MAX_USERS_PER_ACCOUNT),
            _currentCount: countMap.get(id) ?? 0,
          };
        })
        .filter((account) => account._currentCount < account._userLimit)
        .sort((a, b) => {
          const slotsA = a._userLimit - a._currentCount;
          const slotsB = b._userLimit - b._currentCount;
          return slotsA - slotsB;
        });

      if (ordered.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Không có tài khoản nào còn gói & còn slot.",
        });
      }
    }

    const distribution = [];
    let remaining = [...userEmails];

    for (const account of ordered) {
      const currentCount = account._currentCount;
      const userLimit = account._userLimit;
      const slotLeft = Math.max(0, userLimit - currentCount);
      const take = Math.min(slotLeft, remaining.length);
      const chunk = take > 0 ? remaining.splice(0, take) : [];

      distribution.push({
        accountId: account[COLS.ID],
        accountEmail: account[COLS.EMAIL],
        slotLeft,
        added: chunk,
        user_count_before: currentCount,
      });
    }

    const exceededEmails = remaining.length > 0 ? remaining : undefined;
    const totalToAdd = userEmails.length - (exceededEmails?.length ?? 0);
    if (totalToAdd === 0) {
      return res.status(400).json({
        success: false,
        error: "Không đủ slot: tất cả tài khoản đã đạt giới hạn theo số slot (user_count).",
        distribution: distribution.map((item) => ({
          accountId: item.accountId,
          accountEmail: item.accountEmail,
          added: item.added,
        })),
        exceeded_emails: exceededEmails,
      });
    }

    const results = [];
    for (const item of distribution) {
      if (item.added.length === 0) {
        continue;
      }

      const accountId = item.accountId;
      const account = ordered.find((candidate) => candidate[COLS.ID] === accountId);
      if (!account || !account[COLS.EMAIL] || !account[COLS.PASSWORD_ENC]) {
        results.push({
          accountId,
          accountEmail: item.accountEmail,
          added: item.added,
          error: "Thiếu email/password.",
        });
        continue;
      }

      try {
        const batchMailBackupId =
          account[COLS.MAIL_BACKUP_ID] != null
            ? Number(account[COLS.MAIL_BACKUP_ID])
            : null;
        const savedCookies = account[COLS.ALERT_CONFIG]?.cookies || [];
        const otpSource =
          COLS.OTP_SOURCE && account[COLS.OTP_SOURCE]
            ? String(account[COLS.OTP_SOURCE]).trim().toLowerCase()
            : "imap";
        const v2 = await adobeRenewV2.addUsersWithProductV2(
          account[COLS.EMAIL],
          account[COLS.PASSWORD_ENC],
          item.added,
          {
            savedCookies,
            savedCookiesFromDb: account[COLS.ALERT_CONFIG] ?? null,
            mailBackupId: Number.isFinite(batchMailBackupId)
              ? batchMailBackupId
              : null,
            otpSource,
            orgId: account[COLS.ORG_ID] || null,
            maxUsers: resolveAccountUserLimit(account, MAX_USERS_PER_ACCOUNT),
          }
        );
        if (!v2.success) {
          throw new Error(v2.error || "addUsersWithProductV2 thất bại");
        }

        const lisencecount = resolveLisenceCount({
          usersSnapshot: null,
          alertConfig: account[COLS.ALERT_CONFIG],
        });
        const updatePayload = {
          [COLS.USER_COUNT]: userCountDbValue(
            lisencecount,
            v2.userCount ?? (v2.manageTeamMembers?.length ?? 0)
          ),
        };
        if (v2.savedCookies) {
          updatePayload[COLS.ALERT_CONFIG] = mergeRenewAdobeAlertConfig(
            account[COLS.ALERT_CONFIG],
            v2.savedCookies,
            null
          );
        }
        await db(TABLE).where(COLS.ID, accountId).update(updatePayload);

        const addedEmails =
          v2.addResult?.added?.length > 0 ? v2.addResult.added : item.added;
        await lookupAndRecordIfNeeded(addedEmails, accountId).catch((error) => {
          logger.warn("[renew-adobe] Batch lookupAndRecordIfNeeded failed", {
            error: error.message,
          });
        });

        await upsertRenewAdobeOrderUserTrackingForAccount(accountId).catch((error) => {
          logger.warn("[renew-adobe] Batch order_user_tracking failed", {
            error: error.message,
          });
        });

        const addedCount = v2.addResult?.added?.length ?? item.added.length;
        results.push({
          accountId,
          accountEmail: item.accountEmail,
          added: item.added,
          user_count_after: updatePayload[COLS.USER_COUNT],
          members_after: (v2.manageTeamMembers || []).length,
        });
        logger.info(
          "[renew-adobe] Batch: đã thêm %s user vào account %s (V2)",
          addedCount,
          accountId
        );
      } catch (err) {
        logger.error("[renew-adobe] Batch add user failed", {
          id: accountId,
          error: err.message,
        });
        results.push({
          accountId,
          accountEmail: item.accountEmail,
          added: item.added,
          error: err.message,
        });
      }
    }

    const totalAdded = results.reduce(
      (sum, item) => sum + (item.error ? 0 : item.added?.length ?? 0),
      0
    );

    return res.json({
      success: true,
      message: exceededEmails?.length
        ? `Đã thêm ${totalAdded} user vào ${results.length} tài khoản. Còn ${exceededEmails.length} email chưa thêm (hết slot).`
        : `Đã thêm ${totalAdded} user vào ${results.length} tài khoản.`,
      total_added: totalAdded,
      distribution: results,
      exceeded_emails: exceededEmails,
    });
  } catch (err) {
    logger.error("[renew-adobe] Add users batch failed", { error: err.message });
    return res
      .status(500)
      .json({ success: false, error: err.message || "Lỗi batch." });
  }
};

const runAutoDeleteUsers = async ({
  req,
  res,
  runCheckForAccountId,
}) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID không hợp lệ." });
  }

  const userEmails = req.body?.userEmails;
  const list = Array.isArray(userEmails)
    ? userEmails
    : userEmails
      ? [userEmails]
      : [];
  const normalized = list.map((email) => String(email).trim()).filter(Boolean);

  if (normalized.length === 0) {
    return res.status(400).json({ error: "Thiếu userEmails." });
  }

  try {
    const account = await db(TABLE).where(COLS.ID, id).first();
    if (!account) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản." });
    }

    const email = account[COLS.EMAIL];
    const password = account[COLS.PASSWORD_ENC] || "";
    const mailBackupId =
      account[COLS.MAIL_BACKUP_ID] != null
        ? Number(account[COLS.MAIL_BACKUP_ID])
        : null;
    const otpSource =
      COLS.OTP_SOURCE && account[COLS.OTP_SOURCE]
        ? String(account[COLS.OTP_SOURCE]).trim().toLowerCase()
        : "imap";

    logger.info("[renew-adobe] Auto-delete users bắt đầu", {
      id,
      count: normalized.length,
    });

    const result = await adobeRenewV2.autoDeleteUsers(email, password, normalized, {
      savedCookiesFromDb: COLS.ALERT_CONFIG ? account[COLS.ALERT_CONFIG] : null,
      mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
      otpSource,
    });

    if (result.savedCookies && COLS.ALERT_CONFIG) {
      await db(TABLE)
        .where(COLS.ID, id)
        .update({
          [COLS.ALERT_CONFIG]: mergeRenewAdobeAlertConfig(
            account[COLS.ALERT_CONFIG],
            result.savedCookies,
            null
          ),
        });
    }

    try {
      await runCheckForAccountId(id);
    } catch (checkErr) {
      logger.warn("[BatchUsers] runCheckForAccountId thất bại", { id, error: checkErr.message });
    }

    return res.json({
      success: true,
      message: `Đã xử lý: ${result.deleted.length} xóa thành công, ${result.failed.length} lỗi.`,
      deleted: result.deleted,
      failed: result.failed,
    });
  } catch (err) {
    logger.error("[renew-adobe] Auto-delete users failed", {
      id,
      error: err.message,
    });
    return res.status(500).json({
      success: false,
      error: err.message || "Lỗi khi xóa user.",
    });
  }
};

module.exports = {
  runAddUsersBatch,
  runAutoDeleteUsers,
};
