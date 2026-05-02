const { db } = require("../../db");
const logger = require("../../utils/logger");
const adobeRenewV2 = require("../../services/renew-adobe/adobe-renew-v2");
const {
  lookupAndRecordIfNeeded,
  markUsersProductFalseByAccount,
  getMappingCountsByAdobeAccountIds,
  getAssignedAdobeAccountIdForUserEmail,
  getEmailSetAlreadyAssignedToAdobe,
} = require("../../services/userAccountMappingService");
const {
  upsertRenewAdobeOrderUserTrackingForAccount,
} = require("../../services/renew-adobe/orderUserTrackingService");
const { TABLE, COLS, MAX_USERS_PER_ACCOUNT } = require("./accountTable");
const {
  ACTIVE_LICENSE_STATUSES,
  normalizeLicenseStatus,
} = require("./statusUtils");
const {
  resolveLisenceCount,
  mergeRenewAdobeAlertConfig,
  resolveAccountUserLimit,
  resolveAccountSeatLimit,
  userCountDbValue,
} = require("./usersSnapshotUtils");

function hasActivePackageByContractCount(account) {
  const n = Number(resolveAccountSeatLimit(account) || 0);
  return Number.isFinite(n) && n > 0;
}

/** Lỗi từ addUsersWithProductV2 khi team Adobe đã đủ user (snapshot), có thể lệch số dòng mapping DB. */
function isAdobeSlotFullAddError(msg) {
  return String(msg || "").includes("đầy slot");
}

async function buildAvailableAccounts(accounts) {
  const filtered = accounts.filter((account) => {
    const licenseStatus = normalizeLicenseStatus(account[COLS.LICENSE_STATUS]);
    const isActive =
      account[COLS.IS_ACTIVE] !== false &&
      account[COLS.IS_ACTIVE] !== 0 &&
      account[COLS.IS_ACTIVE] !== "0";

    const hasPackageByContract = hasActivePackageByContractCount(account);
    return (
      isActive &&
      (hasPackageByContract || ACTIVE_LICENSE_STATUSES.has(licenseStatus))
    );
  });

  const ids = filtered.map((a) => Number(a[COLS.ID])).filter((n) => n > 0);
  const countMap = await getMappingCountsByAdobeAccountIds(ids);

  return filtered
    .map((account) => {
      const id = Number(account[COLS.ID]);
      return {
        ...account,
        currentCount: countMap.get(id) ?? 0,
        userLimit: resolveAccountUserLimit(account, MAX_USERS_PER_ACCOUNT),
      };
    })
    .filter((account) => account.currentCount < account.userLimit)
    .sort((a, b) => {
      const slotsA = a.userLimit - a.currentCount;
      const slotsB = b.userLimit - b.currentCount;
      return slotsA - slotsB;
    });
}

async function assignUserToAvailableAccount(userEmail) {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Thiếu email.");
  }

  const existingAdobeId = await getAssignedAdobeAccountIdForUserEmail(normalizedEmail);
  if (existingAdobeId != null) {
    const accRow = await db(TABLE).where(COLS.ID, existingAdobeId).first();
    await upsertRenewAdobeOrderUserTrackingForAccount(existingAdobeId).catch((error) => {
      logger.warn("[renew-adobe] assignUserToAvailableAccount tracking refresh failed", {
        accountId: existingAdobeId,
        error: error.message,
      });
    });
    return {
      accountId: existingAdobeId,
      accountEmail: accRow?.[COLS.EMAIL] ?? "",
      profileName: accRow?.[COLS.ORG_NAME] ?? null,
      userCount: accRow?.[COLS.USER_COUNT],
      alreadyOnAdobe: true,
    };
  }

  const accounts = await db(TABLE)
    .select(
      COLS.ID,
      COLS.EMAIL,
      COLS.PASSWORD_ENC,
      COLS.ORG_NAME,
      COLS.LICENSE_STATUS,
      COLS.USER_COUNT,
      COLS.ALERT_CONFIG,
      ...(COLS.OTP_SOURCE ? [COLS.OTP_SOURCE] : []),
      COLS.MAIL_BACKUP_ID,
      COLS.IS_ACTIVE,
      ...(COLS.ID_PRODUCT ? [COLS.ID_PRODUCT] : [])
    )
    .orderBy(COLS.ID, "asc");

  const available = await buildAvailableAccounts(accounts);
  if (available.length === 0) {
    throw new Error("Không có tài khoản nào còn gói và còn slot.");
  }

  let lastAddError = null;
  for (let attempt = 0; attempt < available.length; attempt += 1) {
    const target = available[attempt];
    const accountId = target[COLS.ID];
    const accountEmail = target[COLS.EMAIL];
    const accountPassword = target[COLS.PASSWORD_ENC] || "";
    const mailBackupId =
      target[COLS.MAIL_BACKUP_ID] != null
        ? Number(target[COLS.MAIL_BACKUP_ID])
        : null;
    const savedCookies = target[COLS.ALERT_CONFIG]?.cookies || [];
    const otpSource =
      COLS.OTP_SOURCE && target[COLS.OTP_SOURCE]
        ? String(target[COLS.OTP_SOURCE]).trim().toLowerCase()
        : "imap";

    logger.info(
      "[renew-adobe] assignUserToAvailableAccount: email=%s → account=%s (thử %d/%d)",
      normalizedEmail,
      accountId,
      attempt + 1,
      available.length
    );

    let v2;
    try {
      v2 = await adobeRenewV2.addUsersWithProductV2(
        accountEmail,
        accountPassword,
        [normalizedEmail],
        {
          savedCookies,
          savedCookiesFromDb: target[COLS.ALERT_CONFIG] ?? null,
          mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
          otpSource,
          maxUsers: target.userLimit,
        }
      );
    } catch (addErr) {
      lastAddError = addErr?.message || String(addErr);
      logger.warn(
        "[renew-adobe] assignUserToAvailableAccount: addUsersWithProductV2 ném lỗi (id=%s), thử tài khoản khác: %s",
        accountId,
        lastAddError
      );
      continue;
    }

    if (!v2.success) {
      lastAddError = v2.error || "addUsersWithProductV2 thất bại";
      if (isAdobeSlotFullAddError(lastAddError)) {
        logger.warn(
          "[renew-adobe] assignUserToAvailableAccount: Adobe đầy slot (id=%s), thử tài khoản khác: %s",
          accountId,
          lastAddError
        );
        continue;
      }
      throw new Error(lastAddError);
    }

    const lisencecount = resolveLisenceCount({
      usersSnapshot: null,
      alertConfig: target[COLS.ALERT_CONFIG],
    });
    const updatePayload = {
      [COLS.USER_COUNT]: userCountDbValue(
        lisencecount,
        v2.userCount ?? (v2.manageTeamMembers?.length ?? 0)
      ),
    };
    if (v2.savedCookies) {
      updatePayload[COLS.ALERT_CONFIG] = mergeRenewAdobeAlertConfig(
        target[COLS.ALERT_CONFIG],
        v2.savedCookies,
        null
      );
    }

    await db(TABLE).where(COLS.ID, accountId).update(updatePayload);

    const addedEmails =
      v2.addResult?.added?.length > 0 ? v2.addResult.added : [normalizedEmail];
    await lookupAndRecordIfNeeded(addedEmails, accountId).catch((error) => {
      logger.warn("[renew-adobe] assignUserToAvailableAccount mapping failed", {
        email: normalizedEmail,
        accountId,
        error: error.message,
      });
    });
    const noProductEmails = Array.isArray(v2.addResult?.noProduct)
      ? v2.addResult.noProduct
      : [];
    if (noProductEmails.length > 0) {
      await markUsersProductFalseByAccount(noProductEmails, accountId).catch((error) => {
        logger.warn("[renew-adobe] assignUserToAvailableAccount mark product=false failed", {
          accountId,
          emails: noProductEmails,
          error: error.message,
        });
      });
    }

    await upsertRenewAdobeOrderUserTrackingForAccount(accountId).catch((error) => {
      logger.warn("[renew-adobe] assignUserToAvailableAccount order_user_tracking failed", {
        accountId,
        error: error.message,
      });
    });

    return {
      accountId,
      accountEmail,
      profileName: target[COLS.ORG_NAME] ?? null,
      userCount: updatePayload[COLS.USER_COUNT],
    };
  }

  throw new Error(
    lastAddError ||
      "Không còn tài khoản thử thêm: mọi tài khoản còn slot theo DB đều báo đầy trên Adobe (nên chạy Check hoặc dọn user ngoài Admin Console)."
  );
}

/**
 * Một vòng Fix All: đọc lại DB → chọn tài khoản **gần đầy nhất** (ít slot trống nhất,
 * sort giống buildAvailableAccounts) → lấy tối đa min(slot_trống, số email) user →
 * một lần gọi addUsersWithProductV2 (batch).
 */
async function fixUsersOneRoundTightest(userEmailsRaw) {
  const remainingDistinct = [
    ...new Set(
      (Array.isArray(userEmailsRaw) ? userEmailsRaw : [])
        .map((e) => String(e || "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  if (remainingDistinct.length === 0) {
    return {
      success: true,
      added_count: 0,
      remaining_emails: [],
      round: null,
    };
  }

  const alreadyAssignedEmails = await getEmailSetAlreadyAssignedToAdobe(
    remainingDistinct
  );
  const refreshAccountIds = new Set();
  for (const em of remainingDistinct) {
    if (alreadyAssignedEmails.has(em)) {
      const aid = await getAssignedAdobeAccountIdForUserEmail(em);
      if (aid) refreshAccountIds.add(aid);
    }
  }
  for (const aid of refreshAccountIds) {
    await upsertRenewAdobeOrderUserTrackingForAccount(aid).catch((error) => {
      logger.warn("[renew-adobe] fixUsersOneRoundTightest tracking refresh failed", {
        accountId: aid,
        error: error.message,
      });
    });
  }

  const needAdd = remainingDistinct.filter((e) => !alreadyAssignedEmails.has(e));
  if (needAdd.length === 0) {
    return {
      success: true,
      added_count: 0,
      remaining_emails: [],
      skipped_already_assigned: remainingDistinct.length,
      round: null,
    };
  }

  const accounts = await db(TABLE)
    .select(
      COLS.ID,
      COLS.EMAIL,
      COLS.PASSWORD_ENC,
      COLS.ORG_NAME,
      COLS.LICENSE_STATUS,
      COLS.USER_COUNT,
      COLS.ALERT_CONFIG,
      ...(COLS.OTP_SOURCE ? [COLS.OTP_SOURCE] : []),
      COLS.MAIL_BACKUP_ID,
      COLS.IS_ACTIVE,
      ...(COLS.ID_PRODUCT ? [COLS.ID_PRODUCT] : [])
    )
    .orderBy(COLS.ID, "asc");

  const available = await buildAvailableAccounts(accounts);
  if (available.length === 0) {
    return {
      success: false,
      error: "Không có tài khoản nào còn gói và còn slot.",
      added_count: 0,
      remaining_emails: needAdd,
      round: null,
    };
  }

  let lastAddErr = null;

  for (let ai = 0; ai < available.length; ai += 1) {
    const target = available[ai];
    const accountId = target[COLS.ID];
    const accountEmail = target[COLS.EMAIL];
    const accountPassword = target[COLS.PASSWORD_ENC] || "";
    const slotsLeft = Math.max(0, target.userLimit - target.currentCount);
    const take = Math.min(slotsLeft, needAdd.length);
    if (take === 0) {
      continue;
    }
    const chunk = needAdd.slice(0, take);
    const stillRemaining = needAdd.slice(take);

    const mailBackupId =
      target[COLS.MAIL_BACKUP_ID] != null
        ? Number(target[COLS.MAIL_BACKUP_ID])
        : null;
    const savedCookies = target[COLS.ALERT_CONFIG]?.cookies || [];
    const otpSource =
      COLS.OTP_SOURCE && target[COLS.OTP_SOURCE]
        ? String(target[COLS.OTP_SOURCE]).trim().toLowerCase()
        : "imap";

    logger.info(
      "[renew-adobe] fixUsersOneRoundTightest: account=%s (thử %d/%d) slotsLeft=%s batchSize=%s still=%s",
      accountId,
      ai + 1,
      available.length,
      slotsLeft,
      chunk.length,
      stillRemaining.length
    );

    let v2;
    try {
      v2 = await adobeRenewV2.addUsersWithProductV2(
        accountEmail,
        accountPassword,
        chunk,
        {
          savedCookies,
          savedCookiesFromDb: target[COLS.ALERT_CONFIG] ?? null,
          mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
          otpSource,
          maxUsers: target.userLimit,
        }
      );
    } catch (addErr) {
      lastAddErr = addErr?.message || String(addErr);
      logger.warn(
        "[renew-adobe] fixUsersOneRoundTightest: addUsersWithProductV2 ném lỗi (id=%s), thử tài khoản khác: %s",
        accountId,
        lastAddErr
      );
      continue;
    }

    if (!v2.success) {
      lastAddErr = v2.error || "addUsersWithProductV2 thất bại";
      if (isAdobeSlotFullAddError(lastAddErr)) {
        logger.warn(
          "[renew-adobe] fixUsersOneRoundTightest: Adobe đầy slot (id=%s), thử tài khoản khác",
          accountId
        );
        continue;
      }
      return {
        success: false,
        error: lastAddErr,
        added_count: 0,
        remaining_emails: needAdd,
        round: null,
      };
    }

    try {
      const lisencecount = resolveLisenceCount({
        usersSnapshot: null,
        alertConfig: target[COLS.ALERT_CONFIG],
      });
      const updatePayload = {
        [COLS.USER_COUNT]: userCountDbValue(
          lisencecount,
          v2.userCount ?? (v2.manageTeamMembers?.length ?? 0)
        ),
      };
      if (v2.savedCookies) {
        updatePayload[COLS.ALERT_CONFIG] = mergeRenewAdobeAlertConfig(
          target[COLS.ALERT_CONFIG],
          v2.savedCookies,
          null
        );
      }
      await db(TABLE).where(COLS.ID, accountId).update(updatePayload);

      const addedEmails =
        v2.addResult?.added?.length > 0 ? v2.addResult.added : chunk;
      await lookupAndRecordIfNeeded(addedEmails, accountId).catch((error) => {
        logger.warn("[renew-adobe] fixUsersOneRoundTightest mapping failed", {
          accountId,
          error: error.message,
        });
      });
      const noProductEmails = Array.isArray(v2.addResult?.noProduct)
        ? v2.addResult.noProduct
        : [];
      if (noProductEmails.length > 0) {
        await markUsersProductFalseByAccount(noProductEmails, accountId).catch((error) => {
          logger.warn("[renew-adobe] fixUsersOneRoundTightest mark product=false failed", {
            accountId,
            emails: noProductEmails,
            error: error.message,
          });
        });
      }

      await upsertRenewAdobeOrderUserTrackingForAccount(accountId).catch((error) => {
        logger.warn("[renew-adobe] fixUsersOneRoundTightest order_user_tracking failed", {
          accountId,
          error: error.message,
        });
      });
    } catch (postErr) {
      logger.error("[renew-adobe] fixUsersOneRoundTightest: đã add trên Adobe nhưng cập nhật DB thất bại", {
        accountId,
        error: postErr?.message || String(postErr),
      });
      return {
        success: false,
        error:
          (postErr?.message || "Lỗi sau khi thêm user (cần đối chiếu Adobe vs DB).") +
          " — không thử tài khoản khác để tránh gán trùng user.",
        added_count: 0,
        remaining_emails: needAdd,
        round: null,
      };
    }

    return {
      success: true,
      added_count: (v2.addResult?.added?.length > 0 ? v2.addResult.added : chunk).length,
      remaining_emails: stillRemaining,
      round: {
        accountId,
        accountEmail,
        emails: chunk,
        slotsLeft,
        batchSize: chunk.length,
      },
    };
  }

  return {
    success: false,
    error:
      lastAddErr ||
      "Không còn tài khoản thử thêm: hết slot theo DB hoặc mọi tài khoản đều đầy trên Adobe.",
    added_count: 0,
    remaining_emails: needAdd,
    round: null,
  };
}

const FIX_ALL_MAX_ROUNDS = 500;

/**
 * Fix All: lặp nội bộ từng vòng (B1 tài khoản còn add → B2 slot trống → B3 tối đa min(slot, user còn) → B4 add batch),
 * tới khi hết email hoặc hết tài khoản — một request API thay vì nhiều lần gọi từ client.
 */
async function fixUsersAllRoundsTightest(userEmailsRaw) {
  const initialDistinct = [
    ...new Set(
      (Array.isArray(userEmailsRaw) ? userEmailsRaw : [])
        .map((e) => String(e || "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  if (initialDistinct.length === 0) {
    return {
      success: true,
      total_added: 0,
      added_count: 0,
      rounds: [],
      remaining_emails: [],
    };
  }

  let pending = initialDistinct;
  let totalAdded = 0;
  const rounds = [];
  let lastSkipped = 0;

  for (let i = 0; i < FIX_ALL_MAX_ROUNDS; i += 1) {
    if (pending.length === 0) {
      break;
    }

    const r = await fixUsersOneRoundTightest(pending);

    if (r.skipped_already_assigned != null && r.round == null) {
      lastSkipped = Number(r.skipped_already_assigned) || 0;
      return {
        success: true,
        total_added: 0,
        added_count: 0,
        rounds: [],
        remaining_emails: [],
        skipped_already_assigned: lastSkipped,
      };
    }

    if (!r.success) {
      return {
        success: false,
        error: r.error,
        total_added: totalAdded,
        added_count: totalAdded,
        rounds,
        remaining_emails: r.remaining_emails || pending,
      };
    }

    const added = Number(r.added_count) || 0;
    const next = Array.isArray(r.remaining_emails) ? r.remaining_emails : [];
    totalAdded += added;

    if (r.round) {
      const rr = r.round;
      rounds.push({
        accountId: rr.accountId,
        accountEmail: rr.accountEmail,
        slotsLeft: rr.slotsLeft,
        batchSize: rr.batchSize ?? (Array.isArray(rr.emails) ? rr.emails.length : 0),
        emails: rr.emails || [],
        added_in_round: added,
      });
    }

    if (added === 0) {
      if (next.length > 0) {
        return {
          success: false,
          error: r.error || "Không thêm được user trong vòng này.",
          total_added: totalAdded,
          added_count: totalAdded,
          rounds,
          remaining_emails: next,
        };
      }
      break;
    }

    pending = next;
    if (pending.length === 0) {
      break;
    }
  }

  if (pending.length > 0) {
    return {
      success: false,
      error: "Fix All vượt số vòng tối đa — tăng hạn mức hoặc giảm danh sách.",
      total_added: totalAdded,
      added_count: totalAdded,
      rounds,
      remaining_emails: pending,
    };
  }

  return {
    success: true,
    total_added: totalAdded,
    added_count: totalAdded,
    rounds,
    remaining_emails: [],
  };
}

module.exports = {
  buildAvailableAccounts,
  assignUserToAvailableAccount,
  fixUsersOneRoundTightest,
  fixUsersAllRoundsTightest,
};
