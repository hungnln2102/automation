/**
 * Fix user / Fix all — Automation: không có user_account_mapping;
 * gán team Adobe + cập nhật system_automation.list_user (org_name, status) + cookie_config.
 */

const { db } = require("../../db");
const logger = require("../../utils/logger");
const adobeRenewV2 = require("./adobe-renew-v2");
const { TABLE, COLS, MAX_USERS_PER_ACCOUNT } = require("../../controllers/RenewAdobeController/accountTable");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");
const {
  resolveLisenceCount,
  mergeRenewAdobeAlertConfig,
  resolveAccountUserLimit,
  resolveAccountSeatLimit,
  userCountDbValue,
  withAdobeSlotsUsedInAlertConfig,
} = require("../../controllers/RenewAdobeController/usersSnapshotUtils");
const {
  getOrderUserTrackingCountByOrgName,
  normalizeOrgKeyForTracking,
  normalizeAdminProductIdSet,
  memberProductIds,
  resolveTrackingIdProductAndStatus,
} = require("./orderUserTrackingService");
const { resolveAdminOtpRuntimeOptions } = require("./adminOtpOptions");

const TRACK_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const TRACK_COLS = RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.COLS;

/** Bật qua env ADOBE_V2_SKIP_LOGIN_BEFORE_ADD=1 (hoặc true/yes): mọi lần add user bỏ runCheckFlow, tin profile đã login. */
function shouldSkipAdobeLogin(extra = {}) {
  if (extra && extra.skipLogin === true) return true;
  const v = String(process.env.ADOBE_V2_SKIP_LOGIN_BEFORE_ADD || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isAdobeSlotFullAddError(msg) {
  return String(msg || "").includes("đầy slot");
}

function adminLicenseLooksPaid(account) {
  const lic = String(account[COLS.LICENSE_STATUS] || "")
    .trim()
    .toLowerCase();
  return lic === "paid" || lic === "active";
}

function accountIsActive(account) {
  const v = account[COLS.IS_ACTIVE];
  return v !== false && v !== 0 && v !== "0";
}

async function loadAccountsForFix() {
  return db(TABLE)
    .select(
      COLS.ID,
      COLS.EMAIL,
      COLS.PASSWORD_ENC,
      COLS.ORG_NAME,
      COLS.LICENSE_STATUS,
      COLS.USER_COUNT,
      COLS.ALERT_CONFIG,
      ...(COLS.OTP_SOURCE ? [COLS.OTP_SOURCE] : []),
      COLS.IS_ACTIVE,
      COLS.ID_PRODUCT,
    )
    .orderBy(COLS.ID, "asc");
}

async function getAdminOrgKeysSet() {
  const rows = await db(TABLE)
    .where(COLS.IS_ACTIVE, true)
    .select(COLS.ORG_NAME);
  const s = new Set();
  for (const r of rows) {
    const k = normalizeOrgKeyForTracking(r[COLS.ORG_NAME]);
    if (k) s.add(k);
  }
  return s;
}

/**
 * Email đã gắn profile trùng org với một admin đang active → UI coi như đã gán.
 */
async function filterEmailsNeedingFix(emailsDistinct) {
  const adminOrgs = await getAdminOrgKeysSet();
  const need = [];
  for (const em of emailsDistinct) {
    const row = await db(TRACK_TABLE)
      .where(TRACK_COLS.ACCOUNT, em)
      .first();
    const orgKey = normalizeOrgKeyForTracking(row?.[TRACK_COLS.ORG_NAME]);
    if (orgKey && adminOrgs.has(orgKey)) {
      continue;
    }
    need.push(em);
  }
  return need;
}

async function updateListUserAfterAdd(
  emails,
  adminOrgName,
  assignSuccessPerEmail,
  v2,
  adminIdProductRaw
) {
  const org = String(adminOrgName || "").trim() || null;
  const adminSet = normalizeAdminProductIdSet(adminIdProductRaw);
  const membersByEmail = new Map();
  for (const m of v2?.manageTeamMembers || []) {
    const e = normalizeEmail(m?.email);
    if (e) membersByEmail.set(e, m);
  }

  for (const em of emails) {
    const member = membersByEmail.get(em) || null;
    const assignOk = assignSuccessPerEmail && assignSuccessPerEmail.get(em) === true;

    let idProduct = null;
    let status = "chưa cấp quyền";

    if (assignOk && member) {
      const resolved = resolveTrackingIdProductAndStatus(member, adminSet, true);
      idProduct = resolved.idProduct;
      status = resolved.status;
    } else {
      if (member) {
        const ids = memberProductIds(member);
        idProduct = ids[0] || null;
      }
      status = "chưa cấp quyền";
    }

    await db(TRACK_TABLE)
      .where(TRACK_COLS.ACCOUNT, em)
      .update({
        [TRACK_COLS.ORG_NAME]: org,
        [TRACK_COLS.STATUS]: status,
        [TRACK_COLS.ID_PRODUCT]: idProduct,
        [TRACK_COLS.UPDATED_AT]: db.fn.now(),
      });
  }
}

async function buildAvailableAccounts(accounts) {
  const filtered = accounts.filter((account) => {
    if (!accountIsActive(account)) return false;
    const orgName = String(account[COLS.ORG_NAME] || "").trim();
    if (!orgName) return false;

    const seat = resolveAccountSeatLimit(account);
    const hasSeats = Number(seat) > 0;
    if (!adminLicenseLooksPaid(account) && !hasSeats) return false;
    return true;
  });

  const decorated = [];
  for (const account of filtered) {
    const userLimit = resolveAccountUserLimit(account, MAX_USERS_PER_ACCOUNT);
    const currentCount = await getOrderUserTrackingCountByOrgName(
      account[COLS.ORG_NAME]
    );
    if (currentCount < userLimit) {
      decorated.push({
        ...account,
        currentCount,
        userLimit,
      });
    }
  }

  decorated.sort((a, b) => {
    const slotsA = a.userLimit - a.currentCount;
    const slotsB = b.userLimit - b.currentCount;
    return slotsA - slotsB;
  });

  return decorated;
}

async function persistAdminAfterAdd(target, accountId, v2) {
  const lisencecount = resolveLisenceCount({
    alertConfig: target[COLS.ALERT_CONFIG],
  });
  const updatePayload = {
    [COLS.USER_COUNT]: userCountDbValue(
      lisencecount,
      v2.userCount ?? (v2.manageTeamMembers?.length ?? 0)
    ),
  };
  if (v2.savedCookies) {
    const merged = mergeRenewAdobeAlertConfig(
      target[COLS.ALERT_CONFIG],
      v2.savedCookies,
      null
    );
    updatePayload[COLS.ALERT_CONFIG] = withAdobeSlotsUsedInAlertConfig(
      merged,
      v2.manageTeamMembers
    );
  } else if (Array.isArray(v2.manageTeamMembers)) {
    updatePayload[COLS.ALERT_CONFIG] = withAdobeSlotsUsedInAlertConfig(
      target[COLS.ALERT_CONFIG],
      v2.manageTeamMembers
    );
  }
  await db(TABLE).where(COLS.ID, accountId).update(updatePayload);
}

function assignMapForAddedEmails(v2, addedEmails, fallbackEmails) {
  const list =
    addedEmails && addedEmails.length > 0 ? addedEmails : fallbackEmails;
  const unassigned = new Set(
    (v2.assignResult?.unassigned || []).map((e) => normalizeEmail(e))
  );
  const map = new Map();
  for (const e of list) {
    map.set(e, !unassigned.has(e));
  }
  return map;
}

async function assignUserToAvailableAccount(userEmail, assignOpts = {}) {
  const normalizedEmail = normalizeEmail(userEmail);
  if (!normalizedEmail) {
    throw new Error("Thiếu email.");
  }

  const needFix = await filterEmailsNeedingFix([normalizedEmail]);
  if (needFix.length === 0) {
    const row = await db(TRACK_TABLE)
      .where(TRACK_COLS.ACCOUNT, normalizedEmail)
      .first();
    return {
      accountId: null,
      accountEmail: null,
      profileName: row?.[TRACK_COLS.ORG_NAME] ?? null,
      alreadyLinked: true,
    };
  }

  const accounts = await loadAccountsForFix();
  const available = await buildAvailableAccounts(accounts);
  if (available.length === 0) {
    throw new Error("Không có tài khoản nào còn gói và còn slot.");
  }

  let lastAddError = null;
  for (let attempt = 0; attempt < available.length; attempt += 1) {
    const target = available[attempt];
    const accountId = target[COLS.ID];
    const accountEmail = target[COLS.EMAIL];
    const accountPassword = String(target[COLS.PASSWORD_ENC] || "").trim();
    const otpOpts = await resolveAdminOtpRuntimeOptions(target);

    let v2;
    try {
      v2 = await adobeRenewV2.addUsersWithProductV2(
        accountEmail,
        accountPassword,
        [normalizedEmail],
        {
          savedCookiesFromDb: target[COLS.ALERT_CONFIG] ?? null,
          ...otpOpts,
          maxUsers: target.userLimit,
          skipLogin: shouldSkipAdobeLogin(assignOpts),
          idProductFromAccount:
            COLS.ID_PRODUCT && target[COLS.ID_PRODUCT] != null
              ? String(target[COLS.ID_PRODUCT]).trim()
              : "",
        }
      );
    } catch (addErr) {
      lastAddError = addErr?.message || String(addErr);
      logger.warn(
        "[renew-adobe] assignUserToAvailableAccount: addUsersWithProductV2 exception id=%s: %s",
        accountId,
        lastAddError
      );
      continue;
    }

    if (!v2.success) {
      lastAddError = v2.error || "addUsersWithProductV2 thất bại";
      if (isAdobeSlotFullAddError(lastAddError)) {
        continue;
      }
      throw new Error(lastAddError);
    }

    await persistAdminAfterAdd(target, accountId, v2);

    const added =
      Array.isArray(v2.addResult?.added) && v2.addResult.added.length > 0
        ? v2.addResult.added.map((e) => normalizeEmail(e))
        : [normalizedEmail];
    const map = assignMapForAddedEmails(v2, added, [normalizedEmail]);
    await updateListUserAfterAdd(
      added,
      target[COLS.ORG_NAME],
      map,
      v2,
      target[COLS.ID_PRODUCT] ?? null
    ).catch((err) => {
      logger.warn("[renew-adobe] update list_user failed", { error: err.message });
    });

    return {
      accountId,
      accountEmail,
      profileName: target[COLS.ORG_NAME] ?? null,
      alreadyLinked: false,
    };
  }

  throw new Error(
    lastAddError ||
      "Không còn tài khoản thử thêm (hết slot trên Adobe hoặc không khớp DB)."
  );
}

async function fixUsersOneRoundTightest(userEmailsRaw) {
  const remainingDistinct = [
    ...new Set(
      (Array.isArray(userEmailsRaw) ? userEmailsRaw : [])
        .map((e) => normalizeEmail(e))
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

  let needAdd = await filterEmailsNeedingFix(remainingDistinct);
  if (needAdd.length === 0) {
    return {
      success: true,
      added_count: 0,
      remaining_emails: [],
      skipped_already_assigned: remainingDistinct.length,
      round: null,
    };
  }

  const accounts = await loadAccountsForFix();
  let available = await buildAvailableAccounts(accounts);
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
    if (needAdd.length === 0) break;

    const target = available[ai];
    const accountId = target[COLS.ID];
    const accountEmail = target[COLS.EMAIL];
    const accountPassword = String(target[COLS.PASSWORD_ENC] || "").trim();

    const freshCount = await getOrderUserTrackingCountByOrgName(
      target[COLS.ORG_NAME]
    );
    const slotsLeft = Math.max(0, target.userLimit - freshCount);
    const take = Math.min(slotsLeft, needAdd.length);
    if (take === 0) {
      continue;
    }

    const chunk = needAdd.slice(0, take);
    const stillRemaining = needAdd.slice(take);

    const otpOpts = await resolveAdminOtpRuntimeOptions(target);

    logger.info(
      "[renew-adobe] fixUsersOneRoundTightest: account=%s slot=%s batch=%s",
      accountId,
      slotsLeft,
      chunk.length
    );

    let v2;
    try {
      v2 = await adobeRenewV2.addUsersWithProductV2(
        accountEmail,
        accountPassword,
        chunk,
        {
          savedCookiesFromDb: target[COLS.ALERT_CONFIG] ?? null,
          ...otpOpts,
          maxUsers: target.userLimit,
          skipLogin: shouldSkipAdobeLogin({}),
          idProductFromAccount:
            COLS.ID_PRODUCT && target[COLS.ID_PRODUCT] != null
              ? String(target[COLS.ID_PRODUCT]).trim()
              : "",
        }
      );
    } catch (addErr) {
      lastAddErr = addErr?.message || String(addErr);
      logger.warn(
        "[renew-adobe] fixUsersOneRoundTightest: exception id=%s: %s",
        accountId,
        lastAddErr
      );
      continue;
    }

    if (!v2.success) {
      lastAddErr = v2.error || "addUsersWithProductV2 thất bại";
      if (isAdobeSlotFullAddError(lastAddErr)) {
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
      await persistAdminAfterAdd(target, accountId, v2);
      const addedEmails =
        v2.addResult?.added?.length > 0
          ? v2.addResult.added.map((e) => normalizeEmail(e))
          : chunk;
      const map = assignMapForAddedEmails(v2, addedEmails, chunk);
      await updateListUserAfterAdd(
        addedEmails,
        target[COLS.ORG_NAME],
        map,
        v2,
        target[COLS.ID_PRODUCT] ?? null
      );

      needAdd = stillRemaining;

      return {
        success: true,
        added_count: addedEmails.length,
        remaining_emails: stillRemaining,
        round: {
          accountId,
          accountEmail,
          emails: chunk,
          slotsLeft,
          batchSize: chunk.length,
        },
      };
    } catch (postErr) {
      logger.error("[renew-adobe] fixUsersOneRoundTightest post-add DB error", {
        accountId,
        error: postErr?.message || String(postErr),
      });
      return {
        success: false,
        error:
          (postErr?.message || "Lỗi sau khi thêm user.") +
          " — không thử tài khoản khác để tránh gán trùng.",
        added_count: 0,
        remaining_emails: needAdd,
        round: null,
      };
    }
  }

  return {
    success: false,
    error:
      lastAddErr ||
      "Không còn tài khoản thử thêm: hết slot theo DB hoặc đầy trên Adobe.",
    added_count: 0,
    remaining_emails: needAdd,
    round: null,
  };
}

const FIX_ALL_MAX_ROUNDS = 500;

async function fixUsersAllRoundsTightest(userEmailsRaw) {
  const initialDistinct = [
    ...new Set(
      (Array.isArray(userEmailsRaw) ? userEmailsRaw : [])
        .map((e) => normalizeEmail(e))
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

  for (let i = 0; i < FIX_ALL_MAX_ROUNDS; i += 1) {
    if (pending.length === 0) break;

    const r = await fixUsersOneRoundTightest(pending);

    if (r.skipped_already_assigned != null && r.round == null) {
      return {
        success: true,
        total_added: 0,
        added_count: 0,
        rounds: [],
        remaining_emails: [],
        skipped_already_assigned: Number(r.skipped_already_assigned) || 0,
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
    if (pending.length === 0) break;
  }

  if (pending.length > 0) {
    return {
      success: false,
      error: "Fix All vượt số vòng tối đa.",
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
  assignUserToAvailableAccount,
  fixUsersAllRoundsTightest,
};
