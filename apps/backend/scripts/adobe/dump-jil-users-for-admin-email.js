/**
 * Chạy luồng B1–B13 (runCheckFlow) cho 1 admin Adobe, in payload JIL users API (raw JSON từng page)
 * khi bật ADOBE_DUMP_JIL_USERS_RAW=1, cùng danh sách user sau applyAdobeProFlags + inferAdobeProProductIdSet.
 *
 * Usage (từ thư mục backend):
 *   ADOBE_DUMP_JIL_USERS_RAW=1 node scripts/adobe/dump-jil-users-for-admin-email.js matthew.mack39211@graphiclean.site
 *
 * Mặc định bỏ qua B12 (trang /products), chỉ chạy B13 + JIL users API — giống khi check có
 * `forceProductCheck: false` + license count cache (tránh Playwright die trên /products).
 * Muốn chạy đủ B12 như production: GET_USER_SKIP_PRODUCT_PAGE=0
 *
 * Tùy chọn — chỉ in phân tích 1 email khách (lowercase):
 *   ADOBE_DUMP_JIL_USERS_RAW=1 DEBUG_USER_EMAIL=user@x.com node scripts/adobe/dump-jil-users-for-admin-email.js <admin_email>
 */

process.env.ADOBE_DUMP_JIL_USERS_RAW = "1";
/** Tránh profile Playwright lỗi “page closed” khi dump (có thể ghi đè bằng ADOBE_V2_SKIP_PERSISTENT_PROFILE=0). */
if (process.env.ADOBE_V2_SKIP_PERSISTENT_PROFILE == null) {
  process.env.ADOBE_V2_SKIP_PERSISTENT_PROFILE = "1";
}

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { db } = require("../../src/db");
const { TABLE, COLS } = require("../../src/controllers/RenewAdobeController/accountTable");
const { runCheckFlow } = require("../../src/services/renew-adobe/adobe-renew-v2/runCheckFlow");
const { resolveAccountSeatLimit } = require("../../src/controllers/RenewAdobeController/usersSnapshotUtils");
const {
  inferAdobeProProductIdSet,
  checkUserAssignedProduct,
} = require("../../src/services/renew-adobe/adobe-renew-v2/shared/accessChecks");

const adminEmailArg = (process.argv[2] || "").trim().toLowerCase();
const debugUserEmail = (process.env.DEBUG_USER_EMAIL || "").trim().toLowerCase();
const outPath = (process.env.ADOBE_DUMP_OUT || "").trim();

async function main() {
  if (!adminEmailArg) {
    console.error(
      "Thiếu email admin. Ví dụ: ADOBE_DUMP_JIL_USERS_RAW=1 node scripts/adobe/dump-jil-users-for-admin-email.js matthew.mack39211@graphiclean.site"
    );
    process.exit(1);
  }

  const account = await db(TABLE)
    .whereRaw(`LOWER(TRIM(${COLS.EMAIL})) = ?`, [adminEmailArg])
    .first();

  if (!account) {
    console.error(`Không tìm thấy accounts_admin với email: ${adminEmailArg}`);
    process.exit(1);
  }

  const email = String(account[COLS.EMAIL] || "").trim();
  const password = String(account[COLS.PASSWORD_ENC] || "").trim();
  if (!password) {
    console.error("Thiếu password_encrypted cho account này.");
    process.exit(1);
  }

  const mailBackupId = null;
  const otpSource =
    COLS.OTP_SOURCE && account[COLS.OTP_SOURCE]
      ? String(account[COLS.OTP_SOURCE]).trim().toLowerCase()
      : "imap";

  const rawOrgName =
    COLS.ORG_NAME && account[COLS.ORG_NAME]
      ? String(account[COLS.ORG_NAME]).trim()
      : "";
  const existingOrgName =
    rawOrgName && rawOrgName !== "-" ? rawOrgName : undefined;

  const existingUrlAccess =
    (COLS.URL_ACCESS &&
      account[COLS.URL_ACCESS] &&
      String(account[COLS.URL_ACCESS]).trim()) ||
    null;

  const cachedContractActiveLicenseCountRaw = resolveAccountSeatLimit(account);
  const cachedContractActiveLicenseCount =
    Number(cachedContractActiveLicenseCountRaw) > 0
      ? Number(cachedContractActiveLicenseCountRaw)
      : null;

  const skipProductPage =
    String(process.env.GET_USER_SKIP_PRODUCT_PAGE || "1").trim() !== "0";
  const licenseCountForSkip =
    cachedContractActiveLicenseCount != null && cachedContractActiveLicenseCount > 0
      ? cachedContractActiveLicenseCount
      : 1;

  console.log("[dump-jil] Admin:", email);
  console.log(
    "[dump-jil] ADOBE_DUMP_JIL_USERS_RAW=1, GET_USER_SKIP_PRODUCT_PAGE=%s (1=skip B12 /products)",
    skipProductPage ? "1" : "0"
  );

  const result = await runCheckFlow(email, password, {
    savedCookies:
      COLS.ALERT_CONFIG && account[COLS.ALERT_CONFIG]
        ? account[COLS.ALERT_CONFIG]?.cookies || []
        : [],
    mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
    otpSource,
    existingUrlAccess,
    existingOrgName,
    cachedContractActiveLicenseCount: skipProductPage
      ? licenseCountForSkip
      : cachedContractActiveLicenseCount,
    forceProductCheck: !skipProductPage,
  });

  if (!result.success) {
    console.error("[dump-jil] runCheckFlow failed:", result.error || result);
    process.exit(1);
  }

  const proIds = inferAdobeProProductIdSet(result.users || [], email);
  const payload = {
    flow_note: skipProductPage
      ? "B12 skipped (GET_USER_SKIP_PRODUCT_PAGE=1): license_status/contract count from cache; users from JIL API + applyAdobeProFlags"
      : "Full B10–B13 including /products scrape",
    adminEmail: email,
    org_name: result.org_name,
    orgId: result.orgId,
    license_status: result.license_status,
    contractActiveLicenseCount: result.contractActiveLicenseCount,
    inferred_ccp_product_ids: [...proIds],
    jil_users_raw_pages: result.jil_users_raw_pages || null,
    users_after_apply_flags: (result.users || []).map((u) => ({
      email: u.email,
      name: u.name,
      hasProduct: u.hasProduct,
      product: u.product,
      products: u.products,
    })),
  };

  if (debugUserEmail) {
    const check = checkUserAssignedProduct(
      result.users || [],
      debugUserEmail,
      email
    );
    payload.debug_user_email = debugUserEmail;
    payload.debug_user_assigned = check;
  }

  const text = JSON.stringify(payload, null, 2);
  if (outPath) {
    fs.writeFileSync(outPath, text, "utf8");
    console.log("[dump-jil] Đã ghi file:", path.resolve(outPath));
  } else {
    console.log(text);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.destroy().catch(() => {}));
