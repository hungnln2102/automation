const { db } = require("../../db");
const logger = require("../../utils/logger");
const adobeRenewV2 = require("../../services/renew-adobe/adobe-renew-v2");
const { TABLE, COLS } = require("./accountTable");
const { persistCheckResult } = require("./checkSyncService");
const {
  mergeRenewAdobeAlertConfig,
  resolveAccountSeatLimit,
} = require("./usersSnapshotUtils");
const {
  upsertRenewAdobeOrderUserTrackingForAccount,
  reconcileOrderUserTrackingWithTeamMembers,
} = require("../../services/renew-adobe/orderUserTrackingService");

/** Bật xóa toàn team khi cột id_product không còn token chứa CCP (cron check mỗi giờ dùng chung luồng này). */
function isRenewAdobeDeleteAllWhenNoCcpEnabled() {
  const v = String(process.env.RENEW_ADOBE_DELETE_ALL_WHEN_NO_CCP || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * id_product thường là CSV các mã; coi là còn gói có CCP khi có ít nhất một token chứa "CCP" (không phân biệt hoa thường).
 */
function idProductFieldContainsCcp(raw) {
  const parts = String(raw ?? "")
    .split(/[\s,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.some((tok) => tok.includes("CCP"));
}

function pickOverflowUserEmails(manageTeamMembers, contractActiveLicenseCount) {
  const users = Array.isArray(manageTeamMembers) ? manageTeamMembers : [];
  const limit = Number(contractActiveLicenseCount || 0);
  if (!Number.isFinite(limit) || limit < 0) return [];
  if (users.length <= limit) return [];

  const overflowCount = users.length - limit;
  return users
    .map((user, index) => ({
      index,
      email: String(user?.email || "").trim().toLowerCase(),
      hasProduct: user?.product === true || user?.hasPackage === true,
    }))
    .filter((item) => item.email)
    .sort((a, b) => {
      const productRankA = a.hasProduct ? 1 : 0;
      const productRankB = b.hasProduct ? 1 : 0;
      if (productRankA !== productRankB) return productRankA - productRankB;
      return a.index - b.index;
    })
    .slice(0, overflowCount)
    .map((item) => item.email);
}

/**
 * Chỉ còn hệ thống auto Adobe: không dùng bảng mapping phụ nữa.
 * Tracking user được đọc/ghi qua system_automation.list_user khi có dữ liệu tương ứng.
 */
async function syncMappingAndUpsertTracking(accountId, scrapedData, syncFromTeam) {
  await upsertRenewAdobeOrderUserTrackingForAccount(accountId).catch((err) => {
    logger.warn("[renew-adobe] list_user: %s", err.message);
  });
  if (syncFromTeam) {
    return await reconcileOrderUserTrackingWithTeamMembers(
      accountId,
      scrapedData?.manageTeamMembers || [],
      scrapedData?.id_product ?? null
    ).catch((err) => {
      logger.warn("[renew-adobe] reconcile list_user: %s", err.message);
      return null;
    });
  }
  return null;
}

async function runCheckForAccountId(id) {
  const account = await db(TABLE).where(COLS.ID, id).first();
  if (!account) {
    throw new Error("Không tìm thấy tài khoản.");
  }

  const email = account[COLS.EMAIL];
  const password = account[COLS.PASSWORD_ENC] || "";
  if (!email || !password) {
    throw new Error("Thiếu email hoặc password_enc.");
  }

  const mailBackupId = null;
  const otpSource =
    COLS.OTP_SOURCE && account[COLS.OTP_SOURCE]
      ? String(account[COLS.OTP_SOURCE]).trim().toLowerCase()
      : "imap";
  logger.info("[renew-adobe] Check account", { id, email });

  const existingUrlAccess =
    (COLS.URL_ACCESS &&
      account[COLS.URL_ACCESS] &&
      String(account[COLS.URL_ACCESS]).trim()) ||
    null;
  const rawOrgName =
    COLS.ORG_NAME && account[COLS.ORG_NAME]
      ? String(account[COLS.ORG_NAME]).trim()
      : "";
  const existingOrgName =
    rawOrgName && rawOrgName !== "-" ? rawOrgName : undefined;
  const existingAdobeOrgIdRaw =
    COLS.ADOBE_ORG_ID && account[COLS.ADOBE_ORG_ID]
      ? String(account[COLS.ADOBE_ORG_ID]).trim()
      : "";
  const existingAdobeOrgId =
    existingAdobeOrgIdRaw !== "" ? existingAdobeOrgIdRaw : undefined;
  const cachedContractActiveLicenseCountRaw = resolveAccountSeatLimit(account);
  // Chỉ dùng cache khi > 0 để tránh stale "0" gây false expired và xóa nhầm user.
  const cachedContractActiveLicenseCount =
    Number(cachedContractActiveLicenseCountRaw) > 0
      ? Number(cachedContractActiveLicenseCountRaw)
      : null;

  const result = await adobeRenewV2.checkAccount(email, password, {
    savedCookiesFromDb: COLS.ALERT_CONFIG ? account[COLS.ALERT_CONFIG] : null,
    mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
    otpSource,
    existingUrlAccess,
    existingOrgName,
    existingAdobeOrgId,
    cachedContractActiveLicenseCount,
    forceProductCheck: true,
  });

  if (!result.success) {
    if (result._stack) {
      logger.error(
        "[renew-adobe] checkAccount thất bại với stack:\n%s",
        result._stack
      );
    }
    throw new Error(result.error || "Check thất bại.");
  }

  let scrapedData = result.scrapedData;
  let didMassDeleteAll = false;

  await persistCheckResult(id, {
    scrapedData,
    savedCookies: result.savedCookies || null,
  });
  logger.info("[renew-adobe] Check xong — đã cập nhật DB", {
    id,
    license_status: scrapedData.licenseStatus,
  });

  let contractActiveLicenseCount = Number(
    scrapedData.contractActiveLicenseCount || 0
  );
  let hasActiveLicense =
    String(scrapedData.licenseStatus || "")
      .trim()
      .toLowerCase() === "paid";

  if (!hasActiveLicense) {
    const userEmails = (scrapedData.manageTeamMembers || [])
      .map((user) => user.email)
      .filter(Boolean);

    if (userEmails.length > 0) {
      // Safe-guard: re-check realtime (force product check) trước khi xóa hàng loạt.
      try {
        const confirmResult = await adobeRenewV2.checkAccount(email, password, {
          savedCookiesFromDb: result.savedCookies || null,
          mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
          otpSource,
          existingUrlAccess,
          existingOrgName,
          existingAdobeOrgId,
          forceProductCheck: true,
        });
        if (confirmResult.success && confirmResult.scrapedData) {
          scrapedData = confirmResult.scrapedData;
          contractActiveLicenseCount = Number(
            confirmResult.scrapedData.contractActiveLicenseCount || 0
          );
          hasActiveLicense =
            String(confirmResult.scrapedData.licenseStatus || "")
              .trim()
              .toLowerCase() === "paid";
          await persistCheckResult(id, {
            scrapedData: confirmResult.scrapedData,
            savedCookies: confirmResult.savedCookies || result.savedCookies || null,
          });
        }
      } catch (confirmErr) {
        logger.warn(
          "[renew-adobe] Account %s: confirm license check failed before delete-all: %s",
          id,
          confirmErr.message
        );
      }

      if (hasActiveLicense) {
        logger.warn(
          "[renew-adobe] Account %s: skip auto-delete-all vì confirm check cho thấy còn gói (license_status=%s, contractActiveLicenseCount=%s)",
          id,
          scrapedData.licenseStatus,
          contractActiveLicenseCount
        );
        return await syncMappingAndUpsertTracking(id, scrapedData, true);
      }

      logger.info(
        "[renew-adobe] Account %s expired → auto-delete %s users",
        id,
        userEmails.length
      );
      try {
        await adobeRenewV2.autoDeleteUsers(email, password, userEmails, {
          savedCookiesFromDb: result.savedCookies || null,
          mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
          otpSource,
        });
        await db(TABLE).where(COLS.ID, id).update({
          [COLS.USER_COUNT]: 0,
        });
        didMassDeleteAll = true;

        logger.info("[renew-adobe] Auto-delete xong cho account %s", id);
      } catch (deleteError) {
        logger.error(
          "[renew-adobe] Auto-delete failed cho account %s: %s",
          id,
          deleteError.message
        );
      }
    }
  }

  if (hasActiveLicense && contractActiveLicenseCount > 0) {
    const overflowUserEmails = pickOverflowUserEmails(
      scrapedData.manageTeamMembers || [],
      contractActiveLicenseCount
    );

    if (overflowUserEmails.length > 0) {
      logger.info(
        "[renew-adobe] Account %s over limit (%s/%s) → auto-delete %s overflow users (ưu tiên user không có product)",
        id,
        scrapedData.manageTeamMembers?.length || 0,
        contractActiveLicenseCount,
        overflowUserEmails.length
      );

      try {
        const deleteResult = await adobeRenewV2.autoDeleteUsers(
          email,
          password,
          overflowUserEmails,
          {
            savedCookiesFromDb: result.savedCookies || null,
            mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
            otpSource,
          }
        );

        if (deleteResult.savedCookies && COLS.ALERT_CONFIG) {
          await db(TABLE).where(COLS.ID, id).update({
            [COLS.ALERT_CONFIG]: mergeRenewAdobeAlertConfig(
              result.savedCookies,
              deleteResult.savedCookies,
              null
            ),
          });
        }

        if (
          deleteResult.snapshot &&
          Array.isArray(deleteResult.snapshot.manageTeamMembers)
        ) {
          await db(TABLE).where(COLS.ID, id).update({
            [COLS.USER_COUNT]: Number(contractActiveLicenseCount) || 0,
          });
        }
      } catch (deleteError) {
        logger.error(
          "[renew-adobe] Auto-delete overflow users failed cho account %s: %s",
          id,
          deleteError.message
        );
      }
    }
  }

  if (
    !didMassDeleteAll &&
    isRenewAdobeDeleteAllWhenNoCcpEnabled() &&
    scrapedData.manageTeamMembers &&
    Array.isArray(scrapedData.manageTeamMembers) &&
    scrapedData.manageTeamMembers.length > 0
  ) {
    const idProdStr =
      scrapedData.id_product != null ? String(scrapedData.id_product).trim() : "";
    const teamEmailsNoCcp = scrapedData.manageTeamMembers
      .map((user) => String(user?.email || "").trim())
      .filter(Boolean);
    if (teamEmailsNoCcp.length > 0 && !idProductFieldContainsCcp(idProdStr)) {
      logger.warn(
        "[renew-adobe] Account %s: id_product không còn CCP (%s) — auto-delete %s user (RENEW_ADOBE_DELETE_ALL_WHEN_NO_CCP)",
        id,
        idProdStr ? idProdStr.slice(0, 120) : "(rỗng)",
        teamEmailsNoCcp.length
      );
      try {
        const deleteResult = await adobeRenewV2.autoDeleteUsers(
          email,
          password,
          teamEmailsNoCcp,
          {
            savedCookiesFromDb: result.savedCookies || null,
            mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
            otpSource,
          }
        );

        const mergedAlertConfig =
          deleteResult.savedCookies && COLS.ALERT_CONFIG
            ? mergeRenewAdobeAlertConfig(
                result.savedCookies,
                deleteResult.savedCookies,
                null
              )
            : null;

        await db(TABLE).where(COLS.ID, id).update({
          [COLS.USER_COUNT]: 0,
          ...(COLS.LICENSE_STATUS ? { [COLS.LICENSE_STATUS]: "expired" } : {}),
          ...(mergedAlertConfig ? { [COLS.ALERT_CONFIG]: mergedAlertConfig } : {}),
        });

        const scrapedAfterNoCcp = {
          ...scrapedData,
          licenseStatus: "expired",
          manageTeamMembers: [],
          userCount: 0,
          contractActiveLicenseCount: 0,
        };
        await persistCheckResult(id, {
          scrapedData: scrapedAfterNoCcp,
          savedCookies: mergedAlertConfig ?? result.savedCookies ?? null,
        });

        logger.info(
          "[renew-adobe] Auto-delete (không CCP trong id_product) xong account %s",
          id
        );
        return await syncMappingAndUpsertTracking(id, scrapedAfterNoCcp, true);
      } catch (deleteErr) {
        logger.error(
          "[renew-adobe] Auto-delete khi không CCP trong id_product failed account %s: %s",
          id,
          deleteErr.message
        );
      }
    }
  }

  return await syncMappingAndUpsertTracking(
    id,
    scrapedData,
    hasActiveLicense
  );
}

const runCheck = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const marker = `check-v2-${Date.now()}`;

  logger.info("[renew-adobe] runCheck ENTER id=%s marker=%s", id, marker);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID không hợp lệ.", _marker: marker });
  }

  try {
    const trackingReconcile = await runCheckForAccountId(id);
    const account = await db(TABLE).where(COLS.ID, id).first();

    return res.json({
      success: true,
      message: "Check thành công.",
      _marker: marker,
      org_name: account?.[COLS.ORG_NAME] ?? null,
      adobe_org_id: account?.[COLS.ADOBE_ORG_ID] ?? null,
      user_count: account?.[COLS.USER_COUNT] ?? 0,
      license_status: account?.[COLS.LICENSE_STATUS] ?? "unknown",
      tracking_reconcile:
        trackingReconcile && typeof trackingReconcile === "object"
          ? {
              updated: trackingReconcile.updated ?? 0,
              onTeam: trackingReconcile.onTeam ?? [],
              notOnTeam: trackingReconcile.notOnTeam ?? [],
            }
          : null,
    });
  } catch (err) {
    logger.error("[renew-adobe] Run check failed marker=%s", marker, {
      id,
      error: err.message,
      stack: err.stack,
    });
    if (err.message === "Không tìm thấy tài khoản.") {
      return res.status(404).json({ error: err.message, _marker: marker });
    }
    if (err.message === "Thiếu email hoặc password_enc.") {
      return res.status(400).json({ error: err.message, _marker: marker });
    }
    return res.status(400).json({
      success: false,
      message: err.message || "Check thất bại.",
      _marker: marker,
      _stack: err.stack,
    });
  }
};

const runCheckWithCookies = async (_req, res) => {
  return res.status(400).json({
    error:
      "Endpoint check-with-cookies không còn hỗ trợ. Dùng POST /accounts/:id/check.",
  });
};

module.exports = {
  runCheckForAccountId,
  runCheck,
  runCheckWithCookies,
  /** Cho luồng sau delete/API snapshot: không cần scrape lại UI */
  syncMappingAndUpsertTracking,
};
