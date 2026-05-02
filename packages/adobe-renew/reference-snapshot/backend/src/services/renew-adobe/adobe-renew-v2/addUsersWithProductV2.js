/**
 * Add users + assign product via API (V2).
 * Luồng: B1–B9 (onlyLogin) → /users → create user (abpapi) + assign product (PATCH) → snapshot.
 * Không chạy B15 sau add: gói + slot đã kiểm tra ở tầng gán tài khoản; check định kỳ đã gỡ product admin khi cần.
 */

const logger = require("../../../utils/logger");
const { runCheckFlow } = require("./runCheckFlow");
const { parseCcpProductIdsFromAlertConfig } = require("./shared/accessChecks");
const { getPlaywrightProxyOptions } = require("./shared/proxyConfig");
const { launchSessionFromProfile } = require("./shared/profileSession");
const {
  checkUserAssignedProduct,
  extractOrgTokenFromUrl,
  captureUsersApiHeaders,
} = require("./shared/usersListApi");
const {
  runGotoUsersFlow,
  runAddUsersFlow,
  runUsersSnapshotFlow,
  runPersistUsersSessionFlow,
} = require("./flows/users");

const ADMIN_CONSOLE_URL = "https://adminconsole.adobe.com/";
const POST_ADD_REFRESH_DELAY_MS = (() => {
  const n = Number.parseInt(process.env.ADOBE_V2_POST_ADD_REFRESH_DELAY_MS || "", 10);
  return Number.isFinite(n) && n >= 500 ? n : 1500;
})();

const REUSE_JIL_HEADERS = String(process.env.ADOBE_V2_REUSE_JIL_HEADERS || "1").trim() !== "0";
const POST_ADD_DOUBLE_SNAPSHOT = String(process.env.ADOBE_V2_POST_ADD_DOUBLE_SNAPSHOT || "1").trim() === "1";

function buildDetailedAddUsersError(addResult) {
  const failed = Array.isArray(addResult?.failed) ? addResult.failed : [];
  if (failed.length === 0) {
    return "Add user API fail";
  }

  const preview = failed
    .slice(0, 3)
    .map((item) => {
      const email = String(item?.email || "").trim().toLowerCase() || "unknown_email";
      const reason = String(item?.reason || "unknown_error").trim() || "unknown_error";
      return `${email}:${reason}`;
    })
    .join("; ");

  const suffix =
    failed.length > 3 ? `; ... +${failed.length - 3} user(s)` : "";

  return `Add user API fail (${failed.length} failed): ${preview}${suffix}`;
}

async function addUsersWithProductV2(adminEmail, password, userEmails, options = {}) {
  const savedCookies = options.savedCookies || [];
  const pinnedCcpProductIds = parseCcpProductIdsFromAlertConfig(
    options.savedCookiesFromDb != null
      ? options.savedCookiesFromDb
      : !Array.isArray(options.savedCookies) && options.savedCookies && typeof options.savedCookies === "object"
        ? options.savedCookies
        : null
  );
  const mailBackupId = options.mailBackupId || null;
  const otpSource = options.otpSource || "imap";
  const emails = Array.isArray(userEmails) ? userEmails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean) : [];
  const maxUsers = Number.parseInt(options.maxUsers, 10);
  if (emails.length === 0) {
    return { success: false, error: "Danh sách userEmails rỗng", savedCookies: null, snapshot: null };
  }

  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  const proxyOptions = getPlaywrightProxyOptions();
  const launchOptions = {
    headless,
    slowMo: headless ? 0 : 80,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  };
  if (proxyOptions) launchOptions.proxy = proxyOptions;

  let context = null;
  let page = null;
  try {
    const prof = await launchSessionFromProfile({
      adminEmail,
      headless,
      proxyOptions,
    });
    context = prof.context;
    page = prof.page;
  } catch (profileErr) {
    logger.warn(
      "[adobe-v2] addUsersWithProductV2: persistent profile unavailable, fallback to ephemeral context: %s",
      profileErr.message
    );
    const { chromium } = require("playwright");
    const browser = await chromium.launch(launchOptions);
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();
    context.__adobeEphemeralBrowser = browser;
  }
  const sharedSession = { context, page };

  try {
    logger.info("[adobe-v2] addUsersWithProductV2: login (B1–B9 onlyLogin) → add=%d", emails.length);

    const loginResult = await runCheckFlow(adminEmail, password, {
      savedCookies,
      mailBackupId,
      otpSource,
      sharedSession,
      onlyLogin: true,
    });
    if (!loginResult.success) {
      return { success: false, error: loginResult.error || "Login fail", savedCookies: null, snapshot: null };
    }

    const page = sharedSession.page;

    if (!page.url().includes("@AdobeOrg")) {
      await page.goto(ADMIN_CONSOLE_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await page.waitForURL(/@AdobeOrg/, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    await runGotoUsersFlow(page);

    let precapturedJilHeaders = null;
    if (Number.isFinite(maxUsers) && maxUsers > 0) {
      const preAddSnapshot = await runUsersSnapshotFlow(page, {
        adminEmail,
        pinnedCcpProductIds,
      });
      if (REUSE_JIL_HEADERS) {
        precapturedJilHeaders = preAddSnapshot.capturedJilHeaders || null;
      }
      const currentMembers = Number.parseInt(preAddSnapshot?.userCount, 10) || 0;
      if (currentMembers >= maxUsers) {
        return {
          success: false,
          error: `Account đã đầy slot (${currentMembers}/${maxUsers}, theo số user trên Adobe Admin; có thể lệch cột SLOT bảng vì cột đó đếm order tracking / giới hạn gói). Bỏ qua add user.`,
          savedCookies: null,
          snapshot: preAddSnapshot,
        };
      }
    } else if (REUSE_JIL_HEADERS) {
      const orgToken = extractOrgTokenFromUrl(page.url());
      if (orgToken) {
        precapturedJilHeaders = await captureUsersApiHeaders(page, orgToken);
      }
    }

    const addResult = await runAddUsersFlow(page, emails, {
      precapturedJilHeaders: precapturedJilHeaders || undefined,
    });
    if (!addResult.success) {
      const detailedError = buildDetailedAddUsersError(addResult);
      logger.warn("[adobe-v2] addUsersWithProductV2: add flow failed", {
        requested: emails.length,
        done: Array.isArray(addResult?.done) ? addResult.done.length : 0,
        failed: Array.isArray(addResult?.failed) ? addResult.failed : [],
        stoppedByPolicy: addResult?.stoppedByPolicy === true,
        error: detailedError,
      });
      const sessionResult = await runPersistUsersSessionFlow(context).catch(() => ({
        savedCookies: null,
      }));
      return {
        success: false,
        error: detailedError,
        savedCookies: sessionResult.savedCookies,
        snapshot: null,
      };
    }

    // Product đã được assign ngay trong runAddUsersFlow (create user + PATCH add product).
    // Tái dùng JIL headers (không goto/reload) + delay — thay 2x runGotoUsersFlow + 2x capture.

    const snapshotArgs = {
      adminEmail,
      pinnedCcpProductIds,
      ...(REUSE_JIL_HEADERS && precapturedJilHeaders
        ? { reusableJilHeaders: precapturedJilHeaders }
        : {}),
    };

    let confirmedSnapshot;
    try {
      await page.waitForTimeout(POST_ADD_REFRESH_DELAY_MS);
      confirmedSnapshot = await runUsersSnapshotFlow(page, snapshotArgs);
      if (POST_ADD_DOUBLE_SNAPSHOT) {
        await page.waitForTimeout(POST_ADD_REFRESH_DELAY_MS);
        confirmedSnapshot = await runUsersSnapshotFlow(page, snapshotArgs);
      }
    } catch (refreshErr) {
      logger.warn(
        "[adobe-v2] addUsersWithProductV2: re-fetch users after add failed: %s",
        refreshErr.message
      );
      confirmedSnapshot = {
        userCount: 0,
        users: [],
        manageTeamMembers: [],
        capturedJilHeaders: null,
      };
    }

    const sessionResult = await runPersistUsersSessionFlow(context);
    const adminNorm = String(adminEmail || "").trim().toLowerCase();
    const adminUser =
      (confirmedSnapshot.users || []).find(
        (user) => String(user?.email || "").trim().toLowerCase() === adminNorm
      ) || null;
    const assignmentChecks = emails.map((email) => {
      const check = checkUserAssignedProduct(
        confirmedSnapshot.users || [],
        email,
        adminEmail,
        pinnedCcpProductIds
      );
      return {
        email,
        assigned: check.assigned === true,
      };
    });
    const unassignedEmails = assignmentChecks
      .filter((item) => item.assigned !== true)
      .map((item) => item.email);
    const assignSuccess = unassignedEmails.length === 0;
    if (!assignSuccess) {
      logger.warn(
        "[adobe-v2] addUsersWithProductV2: snapshot shows unassigned users after add",
        {
          requested: emails.length,
          unassigned: unassignedEmails,
        }
      );
    }

    return {
      success: true,
      addResult: {
        success: true,
        added: addResult.done || emails,
        noProduct: addResult.noProduct || [],
        failed: (addResult.failed || []).map((f) => f.email),
        unassigned: (addResult.unassigned || []).map((u) => ({
          email: u.email,
          reason: u.reason,
        })),
      },
      assignResult: {
        success: assignSuccess,
        assignedCount: emails.length - unassignedEmails.length,
        unassigned: unassignedEmails,
      },
      manageTeamMembers: confirmedSnapshot.manageTeamMembers,
      adminConsoleUsers: confirmedSnapshot.users,
      adminUser,
      snapshotConfirmed: true,
      userCount: confirmedSnapshot.userCount,
      licenseStatus: "unknown",
      savedCookies: sessionResult.savedCookies,
    };
  } catch (err) {
    logger.error("[adobe-v2] addUsersWithProductV2 error: %s", err.message);
    return { success: false, error: err.message, savedCookies: null, snapshot: null };
  } finally {
    if (context) {
      const ephemeralBrowser = context.__adobeEphemeralBrowser || null;
      await context.close().catch(() => {});
      if (ephemeralBrowser) {
        await ephemeralBrowser.close().catch(() => {});
      }
    }
  }
}

module.exports = { addUsersWithProductV2 };

