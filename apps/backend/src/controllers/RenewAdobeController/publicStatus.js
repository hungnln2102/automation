const { db } = require("../../db");
const logger = require("../../utils/logger");
const {
  SCHEMA_RENEW_ADOBE,
  RENEW_ADOBE_SCHEMA,
  tableName,
} = require("../../config/dbSchema");

const TRACK_TABLE = tableName(
  RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.TABLE,
  SCHEMA_RENEW_ADOBE
);
const TRACK_COLS = RENEW_ADOBE_SCHEMA.ORDER_USER_TRACKING.COLS;
const ACC_TABLE = tableName(RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE, SCHEMA_RENEW_ADOBE);
const ACC_COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeOrgKey(orgName) {
  return String(orgName ?? "").trim().toLowerCase();
}

/**
 * Tìm dòng list_user phù hợp nhất (ưu tiên dòng có expired xa nhất trong tương lai).
 */
function pickBestTrackingRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const now = Date.now();
  let best = rows[0];
  let bestExpiry = -Infinity;

  for (const row of rows) {
    const exp = row[TRACK_COLS.EXPIRED];
    if (exp) {
      const t = new Date(exp).getTime();
      if (Number.isFinite(t) && t > bestExpiry) {
        bestExpiry = t;
        best = row;
      }
    }
  }
  return best;
}

/**
 * Kiểm tra email hết hạn chưa.
 */
function isExpired(expiredValue) {
  if (!expiredValue) return false;
  const t = new Date(expiredValue).getTime();
  if (!Number.isFinite(t)) return false;
  // So sánh theo ngày (UTC start of day)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return t < today.getTime();
}

/**
 * Tìm account admin khớp org_name với dòng tracking.
 */
async function findAdminAccountByOrgName(orgName) {
  const orgKey = normalizeOrgKey(orgName);
  if (!orgKey) return null;
  return db(ACC_TABLE)
    .whereRaw(`LOWER(TRIM(COALESCE(??::text, ''))) = ?`, [ACC_COLS.ORG_NAME, orgKey])
    .where(ACC_COLS.IS_ACTIVE, true)
    .first();
}

/**
 * Kiểm tra user có product trên Adobe team không (dựa vào status trong list_user).
 */
function userHasProduct(trackingRow) {
  const status = String(trackingRow[TRACK_COLS.STATUS] || "").trim();
  return status === "có gói";
}

/**
 * GET /api/renew-adobe/public/status?email=...
 */
const getPublicStatus = async (req, res) => {
  const email = normalizeEmail(req.query?.email);
  if (!email) {
    return res.status(400).json({ success: false, error: "Thiếu email." });
  }
  if (!EMAIL_OK.test(email)) {
    return res.status(400).json({ success: false, error: "Email không hợp lệ." });
  }

  try {
    // Tìm trong list_user
    const rows = await db(TRACK_TABLE)
      .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [TRACK_COLS.ACCOUNT, email])
      .orderBy(TRACK_COLS.ID, "desc");

    if (!rows || rows.length === 0) {
      // Không có trong hệ thống
      return res.json({
        success: true,
        email,
        status: "no_order",
        canActivate: false,
        profileName: null,
        message: "Email không có trong hệ thống đơn hàng.",
        order: null,
        account: null,
      });
    }

    const row = pickBestTrackingRow(rows);
    const expired = row[TRACK_COLS.EXPIRED];
    const orderExpired = isExpired(expired);
    const orgName = String(row[TRACK_COLS.ORG_NAME] || "").trim() || null;

    // Build order snapshot
    const order = {
      orderCode: row[TRACK_COLS.CUSTOMER] || null,
      expiryDate: expired
        ? new Date(expired).toISOString().slice(0, 10)
        : null,
      isExpired: orderExpired,
      status: row[TRACK_COLS.STATUS] || null,
    };

    // Nếu hết hạn
    if (orderExpired) {
      return res.json({
        success: true,
        email,
        status: "order_expired",
        canActivate: false,
        profileName: orgName,
        message: "Đơn hàng đã hết hạn.",
        order,
        account: null,
      });
    }

    // Tìm account admin khớp org
    const adminAccount = orgName ? await findAdminAccountByOrgName(orgName) : null;

    if (!adminAccount) {
      // Có trong list_user nhưng chưa được gán profile admin
      return res.json({
        success: true,
        email,
        status: "needs_activation",
        canActivate: true,
        profileName: orgName,
        message: "Email chưa được gán vào profile Adobe. Bấm Kích Hoạt để tiến hành.",
        order,
        account: null,
      });
    }

    // Có admin account → check license status
    const licenseStatus = String(adminAccount[ACC_COLS.LICENSE_STATUS] || "").trim().toLowerCase();
    const isPaid = licenseStatus === "paid" || licenseStatus === "active";

    // Build account snapshot
    const account = {
      id: adminAccount[ACC_COLS.ID],
      email: adminAccount[ACC_COLS.EMAIL] || null,
      orgName: adminAccount[ACC_COLS.ORG_NAME] || null,
      licenseStatus: adminAccount[ACC_COLS.LICENSE_STATUS] || "unknown",
      userCount: adminAccount[ACC_COLS.USER_COUNT] || 0,
      isActive: adminAccount[ACC_COLS.IS_ACTIVE] !== false,
      userHasProduct: userHasProduct(row),
      urlAccess: ACC_COLS.URL_ACCESS ? (adminAccount[ACC_COLS.URL_ACCESS] || null) : null,
    };

    if (!isPaid) {
      return res.json({
        success: true,
        email,
        status: "needs_activation",
        canActivate: true,
        profileName: orgName,
        message: "Profile Adobe chưa có gói hoạt động. Bấm Kích Hoạt để thử gán lại.",
        order,
        account,
      });
    }

    // Kiểm tra user đã được add vào team chưa
    const trackingStatus = String(row[TRACK_COLS.STATUS] || "").trim();
    if (trackingStatus === "chưa add") {
      return res.json({
        success: true,
        email,
        status: "needs_activation",
        canActivate: true,
        profileName: orgName,
        message: "Email chưa được thêm vào team Adobe. Bấm Kích Hoạt để tiến hành.",
        order,
        account,
      });
    }

    // Active
    return res.json({
      success: true,
      email,
      status: "active",
      canActivate: false,
      profileName: orgName,
      message: userHasProduct(row)
        ? "Profile Adobe đang hoạt động và có gói."
        : "Profile Adobe đang hoạt động. Gói đang chờ cấp quyền.",
      order,
      account,
    });
  } catch (error) {
    logger.error("[renew-adobe/public] status failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: "Không kiểm tra được profile. Vui lòng thử lại sau.",
    });
  }
};

module.exports = {
  getPublicStatus,
};
