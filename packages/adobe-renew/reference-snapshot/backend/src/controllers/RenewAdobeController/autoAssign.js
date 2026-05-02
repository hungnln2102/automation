const { db } = require("../../db");
const logger = require("../../utils/logger");
const adobeRenewV2 = require("../../services/renew-adobe/adobe-renew-v2");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");
const { TABLE, COLS, MAX_USERS_PER_ACCOUNT } = require("./accountTable");
const MAP_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const MAP_COLS = RENEW_ADOBE_SCHEMA.USER_ACCOUNT_MAPPING.COLS;
const {
  buildAvailableAccounts,
  assignUserToAvailableAccount,
  fixUsersAllRoundsTightest,
} = require("./assignmentService");
const {
  TBL_ORDER,
  ORD_COLS,
  ALLOWED_ORDER_STATUSES,
  getRenewAdobeVariantIds,
} = require("./orderAccess");
const {
  purgeAndDeleteNoLicenseAdobeAdminAccount,
} = require("../../services/renew-adobe/renewAdobePurgeNoLicenseAccount");
const { notifyWarn } = require("../../utils/telegramErrorNotifier");
const { shouldPurgeAdobeAccountByLicenseStatus } = require("./statusUtils");
const {
  getProfileUsageSnapshot,
} = require("../../services/renew-adobe/adobe-renew-v2/shared/profileUsageMetrics");
const {
  resolveLisenceCount,
  mergeRenewAdobeAlertConfig,
  userCountDbValue,
} = require("./usersSnapshotUtils");
const {
  upsertRenewAdobeOrderUserTrackingForAccount,
  getOrderUserTrackingCountByOrgName,
} = require("../../services/renew-adobe/orderUserTrackingService");

function logAutoAssign(onProgress, data) {
  if (onProgress) {
    onProgress(data);
  }
  logger.info("[renew-adobe] autoAssign: %s", JSON.stringify(data));
}

async function autoAssignUsers({ onProgress = null } = {}) {
  const variantIds = await getRenewAdobeVariantIds();
  let activeOrders = [];

  if (variantIds.length > 0) {
    activeOrders = await db(TBL_ORDER)
      .select(
        `${TBL_ORDER}.${ORD_COLS.INFORMATION_ORDER} as email`,
        `${TBL_ORDER}.${ORD_COLS.STATUS} as status`,
        `${TBL_ORDER}.${ORD_COLS.EXPIRY_DATE} as expiry_date`
      )
      .whereIn(ORD_COLS.ID_PRODUCT, variantIds)
      .whereIn(ORD_COLS.STATUS, ALLOWED_ORDER_STATUSES)
      .whereNotNull(ORD_COLS.INFORMATION_ORDER);
  }

  const now = new Date();
  const activeEmails = new Set();
  for (const order of activeOrders) {
    if (order.expiry_date && new Date(order.expiry_date) < now) {
      continue;
    }
    const email = (order.email || "").trim().toLowerCase();
    if (email) {
      activeEmails.add(email);
    }
  }

  logAutoAssign(onProgress, { step: "active_orders", count: activeEmails.size });

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
      ...(COLS.ID_PRODUCT ? [COLS.ID_PRODUCT] : [])
    )
    .where(COLS.IS_ACTIVE, true)
    .orderBy(COLS.ID, "asc");

  const existingEmails = new Set();
  const mappedRows = await db(MAP_TABLE)
    .whereNotNull(MAP_COLS.ADOBE_ACCOUNT_ID)
    .select(MAP_COLS.USER_EMAIL);
  for (const r of mappedRows) {
    const em = String(r[MAP_COLS.USER_EMAIL] || "")
      .trim()
      .toLowerCase();
    if (em) existingEmails.add(em);
  }

  const emailsToAdd = [...activeEmails].filter((email) => !existingEmails.has(email));
  logAutoAssign(onProgress, { step: "emails_to_add", count: emailsToAdd.length });

  if (emailsToAdd.length === 0) {
    return { assigned: 0, skipped: 0, errors: [] };
  }

  const available = await buildAvailableAccounts(accounts);
  logAutoAssign(onProgress, {
    step: "available_accounts",
    count: available.length,
    slots: available.map((account) => ({
      id: account[COLS.ID],
      slots: Math.max(0, (account.userLimit || MAX_USERS_PER_ACCOUNT) - account.currentCount),
      limit: account.userLimit || MAX_USERS_PER_ACCOUNT,
    })),
  });

  if (available.length === 0) {
    logAutoAssign(onProgress, {
      step: "no_slots",
      message: "Không có tài khoản nào còn slot",
    });
    return { assigned: 0, skipped: emailsToAdd.length, errors: [] };
  }

  let remaining = [...emailsToAdd];
  const distribution = [];

  for (const account of available) {
    if (remaining.length === 0) {
      break;
    }

    const slotsLeft = Math.max(
      0,
      (account.userLimit || MAX_USERS_PER_ACCOUNT) - account.currentCount
    );
    const take = Math.min(slotsLeft, remaining.length);
    const chunk = remaining.splice(0, take);
    if (chunk.length > 0) {
      distribution.push({ account, emails: chunk });
    }
  }

  let totalAssigned = 0;
  const errors = [];

  for (const { account, emails } of distribution) {
    const accountId = account[COLS.ID];
    const accountEmail = account[COLS.EMAIL];
    const accountPassword = account[COLS.PASSWORD_ENC] || "";

    logAutoAssign(onProgress, {
      step: "adding",
      accountId,
      accountEmail,
      userCount: emails.length,
    });

    try {
      const mailBackupId =
        account[COLS.MAIL_BACKUP_ID] != null
          ? Number(account[COLS.MAIL_BACKUP_ID])
          : null;
      const savedCookies = account[COLS.ALERT_CONFIG]?.cookies || [];
      const otpSource =
        COLS.OTP_SOURCE && account[COLS.OTP_SOURCE]
          ? String(account[COLS.OTP_SOURCE]).trim().toLowerCase()
          : "imap";
      const v2 = await adobeRenewV2.addUsersWithProductV2(
        accountEmail,
        accountPassword,
        emails,
        {
          savedCookies,
          savedCookiesFromDb: account[COLS.ALERT_CONFIG] ?? null,
          mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
          otpSource,
          orgId: account[COLS.ORG_ID] || null,
          maxUsers: account.userLimit || MAX_USERS_PER_ACCOUNT,
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

      const addedCount = v2.addResult?.added?.length ?? emails.length;
      totalAssigned += addedCount;

      await upsertRenewAdobeOrderUserTrackingForAccount(accountId).catch((error) => {
        logger.warn("[renew-adobe] autoAssign order_user_tracking failed", {
          accountId,
          error: error.message,
        });
      });

      logAutoAssign(onProgress, {
        step: "done",
        accountId,
        added: addedCount,
        assignProduct: v2.assignResult?.success ?? false,
      });
    } catch (err) {
      logger.error(
        "[renew-adobe] autoAssign add failed: account=%s, error=%s",
        accountId,
        err.message
      );
      errors.push(`Account ${accountId}: ${err.message}`);
    }
  }

  const skipped = remaining.length;
  logAutoAssign(onProgress, {
    step: "complete",
    assigned: totalAssigned,
    skipped,
    errors: errors.length,
  });

  return { assigned: totalAssigned, skipped, errors };
}

/** Lỗi nghiệp vụ (hết slot, không còn account) — trả 409, không 500. */
function fixUserExpectableErrorMessage(msg) {
  const s = String(msg || "");
  return (
    s.includes("đầy slot") ||
    s.includes("hết slot") ||
    s.includes("Không có tài khoản nào còn gói và còn slot")
  );
}

const runAutoAssign = async (_req, res) => {
  try {
    const result = await autoAssignUsers();
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error("[renew-adobe] runAutoAssign failed", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

const fixSingleUser = async (req, res) => {
  const userEmail = (req.body?.email || "").toString().trim().toLowerCase();
  if (!userEmail) {
    return res.status(400).json({ error: "Thiếu email." });
  }

  try {
    const assigned = await assignUserToAvailableAccount(userEmail);

    if (assigned.alreadyOnAdobe) {
      return res.json({
        success: true,
        already_on_adobe: true,
        message: `User đã có trên admin ${assigned.accountEmail} (đã làm mới tracking).`,
        accountId: assigned.accountId,
        accountEmail: assigned.accountEmail,
        profile: assigned.profileName ?? "—",
      });
    }

    return res.json({
      success: true,
      message: `Đã gán ${userEmail} vào ${assigned.accountEmail}.`,
      accountId: assigned.accountId,
      accountEmail: assigned.accountEmail,
      profile: assigned.profileName ?? "—",
    });
  } catch (err) {
    const msg = err?.message || String(err);
    const expectable = fixUserExpectableErrorMessage(msg);
    (expectable ? logger.warn : logger.error)("[renew-adobe] fixSingleUser failed", {
      email: userEmail,
      error: msg,
    });
    return res.status(expectable ? 409 : 500).json({
      success: false,
      error: msg,
    });
  }
};

/**
 * Fix All: một lần POST — nội bộ nhiều vòng (tài khoản còn slot + batch theo slot),
 * kèm tối ưu add user (Playwright) batch PATCH + tạo user song song ở tầng addUsersFlow.
 */
const fixUsersRound = async (req, res) => {
  const emailsRaw = req.body?.emails;
  if (!Array.isArray(emailsRaw)) {
    return res.status(400).json({
      success: false,
      error: "Thiếu emails (mảng).",
      remaining_emails: [],
    });
  }

  try {
    const result = await fixUsersAllRoundsTightest(emailsRaw);
    return res.json(result);
  } catch (err) {
    logger.error("[renew-adobe] fixUsersRound failed", { error: err.message });
    return res.status(500).json({
      success: false,
      error: err.message,
      added_count: 0,
      total_added: 0,
      remaining_emails: emailsRaw,
      rounds: [],
    });
  }
};

const adobeQueueStatus = (_req, res) => {
  return res.json({
    running: 0,
    queued: 0,
    maxConcurrent: 10,
    maxQueueSize: 100,
  });
};

async function runCheckAllAccountsFlow({
  runCheckForAccountId,
  onEvent = null,
  shouldAbort = () => false,
  includeAutoAssign = true,
  logPrefix = "[renew-adobe][check-all]",
}) {
  const emit = (data) => {
    if (typeof onEvent === "function") {
      onEvent(data);
    }
  };

  const rows = await db(TABLE)
    .select(COLS.ID, COLS.EMAIL)
    .where(COLS.IS_ACTIVE, true)
    .orderBy(COLS.ID, "asc");

  const total = rows.length;
  if (total === 0) {
    emit({ type: "complete", total: 0, completed: 0, failed: 0 });
    return {
      total: 0,
      completed: 0,
      failed: 0,
      autoAssign: null,
    };
  }

  emit({ type: "start", total });

  let completed = 0;
  let failed = 0;
  const queue = [...rows];
  /** Tài khoản không còn gói (trạng thái rõ ràng, không phải unknown) — gửi Telegram sau batch. */
  const nonPaidForTelegram = [];

  // Tuần tự: cùng hàm POST /accounts/:id/check (runCheckForAccountId) — tránh nhiều Playwright song song gây timeout trên server.
  for (const account of queue) {
    if (shouldAbort()) {
      break;
    }
    const id = account[COLS.ID];
    const email = account[COLS.EMAIL];

    emit({ type: "checking", id, email, completed, failed, total });

    try {
      await runCheckForAccountId(id);
      completed++;
      let updated = await db(TABLE).where(COLS.ID, id).first();
      let removedFromDb = false;
      const statusAfterCheck = updated?.[COLS.LICENSE_STATUS] ?? null;
      if (updated && shouldPurgeAdobeAccountByLicenseStatus(statusAfterCheck, updated)) {
        const orgNameForTrack = updated[COLS.ORG_NAME] ?? null;
        const adminNorm = (updated[COLS.EMAIL] || "").toLowerCase().trim();
        const trackingCount = await getOrderUserTrackingCountByOrgName(orgNameForTrack);
        const mappedEmails = await db(MAP_TABLE)
          .where(MAP_COLS.ADOBE_ACCOUNT_ID, id)
          .pluck(MAP_COLS.USER_EMAIL);
        const hasNonAdminUserInMapping = (mappedEmails || []).some((ue) => {
          const l = String(ue || "").toLowerCase().trim();
          return l && l !== adminNorm;
        });
        /**
         * order_user_tracking chỉ có email KH (account), không có dòng cho email đăng nhập admin.
         * - Org chỉ admin (không có end-user trong mapping) + chưa có dòng tracking theo org → không purge (tránh xóa nhầm admin).
         * - Có end-user trong mapping mà không có bản ghi tracking theo org → vẫn purge (case lệch sync / không phải “chỉ admin”).
         */
        if (trackingCount === 0 && !hasNonAdminUserInMapping) {
          logger.info(
            "%s Bỏ qua xóa tài khoản admin id=%s (%s): không có order_user_tracking cho org và mapping chỉ admin (hoặc rỗng) — giữ tài khoản admin.",
            logPrefix,
            id,
            email
          );
        } else {
          nonPaidForTelegram.push({
            id,
            email,
            org_name: orgNameForTrack,
            license_status: statusAfterCheck,
            removed_from_db: false,
          });
          const { deletedFromDb } = await purgeAndDeleteNoLicenseAdobeAdminAccount(
            updated,
            { logPrefix }
          );
          if (deletedFromDb) {
            removedFromDb = true;
            updated = null;
            const last = nonPaidForTelegram[nonPaidForTelegram.length - 1];
            if (last && last.id === id) {
              last.removed_from_db = true;
            }
          }
        }
      }
      emit({
        type: "done",
        id,
        email,
        completed,
        failed,
        total,
        removed_from_db: removedFromDb,
        org_name: updated?.[COLS.ORG_NAME] ?? null,
        user_count: updated?.[COLS.USER_COUNT] ?? 0,
        license_status: updated?.[COLS.LICENSE_STATUS] ?? statusAfterCheck ?? "unknown",
      });
    } catch (err) {
      completed++;
      failed++;
      let license_status = "unknown";
      try {
        const row = await db(TABLE).where(COLS.ID, id).first();
        license_status = row?.[COLS.LICENSE_STATUS] ?? "unknown";
      } catch (_) {
        /* ignore */
      }
      emit({
        type: "error",
        id,
        email,
        error: err.message,
        completed,
        failed,
        total,
        license_status,
      });
    }
  }

  if (nonPaidForTelegram.length > 0) {
    const lines = nonPaidForTelegram.map((a) => {
      const org = a.org_name ? ` | ${a.org_name}` : "";
      const rm = a.removed_from_db ? " | đã gỡ khỏi DB" : "";
      return `• ${a.email}${org} → ${a.license_status}${rm}`;
    });
    const header = `${logPrefix} ${nonPaidForTelegram.length} tài khoản admin không còn gói (sau check-all)`;
    notifyWarn({
      message: `${header}\n${lines.join("\n")}`,
      messageMaxLength: 3800,
      source: "backend",
    });
  }

  emit({ type: "complete", total, completed, failed });

  let autoAssign = null;
  if (!shouldAbort() && includeAutoAssign) {
    logger.info(
      "%s Đã check xong toàn bộ %d tài khoản (completed=%d, failed=%d) — bắt đầu auto-assign (sau khi check, không song song với check).",
      logPrefix,
      total,
      completed,
      failed
    );
    emit({ type: "auto_assign_start" });
    try {
      autoAssign = await autoAssignUsers({
        onProgress: (message) => {
          emit({ type: "auto_assign_progress", ...message });
        },
      });
      emit({ type: "auto_assign_done", ...autoAssign });
    } catch (assignError) {
      emit({ type: "auto_assign_error", error: assignError.message });
    }
  }

  const checkProfileUsage = getProfileUsageSnapshot("check");
  if (checkProfileUsage.length > 0) {
    logger.info(
      "%s Profile usage(check): %s",
      logPrefix,
      JSON.stringify(checkProfileUsage)
    );
  }

  return {
    total,
    completed,
    failed,
    autoAssign,
  };
}

const checkAllAccounts = async ({
  req,
  res,
  runCheckForAccountId,
}) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  const sendEvent = (data) => {
    if (aborted) {
      return;
    }
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runCheckAllAccountsFlow({
      runCheckForAccountId,
      onEvent: sendEvent,
      shouldAbort: () => aborted,
      includeAutoAssign: true,
      logPrefix: "[renew-adobe][check-all]",
    });
  } catch (err) {
    logger.error("[renew-adobe] Check all failed", { error: err.message });
    sendEvent({ type: "fatal", error: err.message });
  }

  return res.end();
};

module.exports = {
  adobeQueueStatus,
  checkAllAccounts,
  runCheckAllAccountsFlow,
  autoAssignUsers,
  runAutoAssign,
  fixSingleUser,
  fixUsersRound,
};
