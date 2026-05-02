const { db } = require("../../db");
const logger = require("../../utils/logger");
const { TABLE, COLS } = require("./accountTable");
const { findAccountMatchByEmail, normalizeEmail } = require("./accountLookup");
const { normalizeOtpSource } = require("../../services/otpProviderService");
const {
  removeProfileDirForEmail,
} = require("../../services/renew-adobe/adobe-renew-v2/shared/profileSession");
const {
  getOrderUserTrackingCountsForAdminAccounts,
} = require("../../services/renew-adobe/orderUserTrackingService");

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CHECK_EMPTY_COLS = [
  COLS.EMAIL,
  COLS.PASSWORD_ENC,
  ...(COLS.ADOBE_ORG_ID ? [COLS.ADOBE_ORG_ID] : []),
  COLS.ORG_NAME,
  COLS.LICENSE_STATUS,
  COLS.USER_COUNT,
  COLS.LAST_CHECKED,
  COLS.IS_ACTIVE,
  COLS.CREATED_AT,
];

function trimStr(value) {
  return value == null ? "" : String(value).trim();
}

function isValueEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number" || typeof value === "boolean") return false;
  if (value instanceof Date) return false;
  return true;
}

function getEmptyFields(row) {
  return CHECK_EMPTY_COLS.filter((col) => isValueEmpty(row[col]));
}

const listMailBackupMailboxes = async (_req, res) => {
  return res.json([]);
};

const createMailBackupMailbox = async (_req, res) => {
  return res
    .status(400)
    .json({ error: "Automation moi khong su dung bang mail_backup." });
};

const listAccounts = async (_req, res) => {
  try {
    const rows = await db(TABLE)
      .select(
        `${TABLE}.${COLS.ID}`,
        `${TABLE}.${COLS.EMAIL}`,
        `${TABLE}.${COLS.PASSWORD_ENC}`,
        ...(COLS.ADOBE_ORG_ID ? [`${TABLE}.${COLS.ADOBE_ORG_ID}`] : []),
        `${TABLE}.${COLS.ORG_NAME}`,
        `${TABLE}.${COLS.LICENSE_STATUS}`,
        `${TABLE}.${COLS.USER_COUNT}`,
        `${TABLE}.${COLS.LAST_CHECKED}`,
        `${TABLE}.${COLS.IS_ACTIVE}`,
        `${TABLE}.${COLS.CREATED_AT}`,
        ...(COLS.OTP_SOURCE ? [`${TABLE}.${COLS.OTP_SOURCE}`] : []),
        ...(COLS.URL_ACCESS ? [`${TABLE}.${COLS.URL_ACCESS}`] : []),
        ...(COLS.ID_PRODUCT ? [`${TABLE}.${COLS.ID_PRODUCT}`] : []),
        db.raw("NULL::text as alias")
      )
      .orderBy(`${TABLE}.${COLS.ID}`, "asc");

    const trackingByAccountId = await getOrderUserTrackingCountsForAdminAccounts(
      rows,
      COLS.ID,
      COLS.ORG_NAME
    );

    const payload = rows.map((row) => ({
      ...row,
      empty_fields: getEmptyFields(row),
      tracking_user_count: trackingByAccountId.get(Number(row[COLS.ID])) ?? 0,
    }));

    logger.info("[renew-adobe] List accounts", { total: payload.length });
    return res.json(payload);
  } catch (error) {
    logger.error("[renew-adobe] List accounts failed", { error: error.message });
    return res
      .status(500)
      .json({ error: "Khong the tai danh sach tai khoan Renew Adobe." });
  }
};

const lookupAccountByEmail = async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ error: "Thieu tham so email." });
  }

  try {
    const { account: row } = await findAccountMatchByEmail(email);
    if (!row) {
      return res.status(404).json({
        error: "Khong tim thay tai khoan voi email tuong ung.",
        account: null,
      });
    }
    return res.json({ account: row });
  } catch (error) {
    logger.error("[renew-adobe] Lookup account failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({ error: "Loi tra cuu tai khoan.", account: null });
  }
};

const createAccount = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = (req.body?.password ?? "").toString();

  if (!email || !EMAIL_OK.test(email)) {
    return res.status(400).json({ error: "Email khong hop le." });
  }
  if (!password.trim()) {
    return res.status(400).json({ error: "Thieu mat khau." });
  }
  if (req.body?.mail_backup_id != null && String(req.body.mail_backup_id).trim() !== "") {
    return res
      .status(400)
      .json({ error: "Automation moi khong su dung bang mail_backup." });
  }

  try {
    const existing = await db(TABLE).where(COLS.EMAIL, email).first();
    if (existing) {
      return res
        .status(409)
        .json({ error: "Email nay da co trong danh sach tai khoan admin." });
    }

    const requestedOtpSource = normalizeOtpSource(req.body?.otp_source, {
      hasMailBackupId: false,
    });
    const otpSource = requestedOtpSource === "imap" ? "hdsd" : requestedOtpSource;

    const [inserted] = await db(TABLE)
      .insert({
        [COLS.EMAIL]: email,
        [COLS.PASSWORD_ENC]: password,
        [COLS.ORG_NAME]: null,
        [COLS.LICENSE_STATUS]: null,
        [COLS.USER_COUNT]: 0,
        [COLS.LAST_CHECKED]: null,
        [COLS.IS_ACTIVE]: true,
        [COLS.CREATED_AT]: db.fn.now(),
        ...(COLS.OTP_SOURCE ? { [COLS.OTP_SOURCE]: otpSource } : {}),
        ...(COLS.URL_ACCESS ? { [COLS.URL_ACCESS]: null } : {}),
      })
      .returning(COLS.ID);

    const id =
      inserted && typeof inserted === "object" ? inserted[COLS.ID] : inserted;

    logger.info("[renew-adobe] Created admin account", { id, email });
    return res.status(201).json({ success: true, id });
  } catch (error) {
    if (error?.code === "23505") {
      return res
        .status(409)
        .json({ error: "Email nay da co trong danh sach tai khoan admin." });
    }
    logger.error("[renew-adobe] Create account failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({ error: "Khong the them tai khoan admin." });
  }
};

const deleteAccount = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID khong hop le." });
  }

  try {
    const row = await db(TABLE).where(COLS.ID, id).first();
    if (!row) {
      return res.status(404).json({ error: "Khong tim thay tai khoan." });
    }

    const deleted = await db(TABLE).where(COLS.ID, id).del();
    if (!deleted) {
      return res.status(404).json({ error: "Khong tim thay tai khoan." });
    }

    try {
      const clean = removeProfileDirForEmail(row[COLS.EMAIL]);
      if (clean.removed) {
        logger.info("[renew-adobe] Deleted local profile dir", {
          id,
          email: trimStr(row[COLS.EMAIL]),
          profileDir: clean.profileDir,
        });
      }
    } catch (profileErr) {
      logger.warn("[renew-adobe] deleteAccount profile cleanup failed", {
        id,
        email: trimStr(row[COLS.EMAIL]),
        error: profileErr.message,
      });
    }

    logger.info("[renew-adobe] Deleted admin account", {
      id,
      email: trimStr(row[COLS.EMAIL]),
    });
    return res.json({ success: true, id });
  } catch (err) {
    logger.error("[renew-adobe] deleteAccount failed", { id, error: err.message });
    return res.status(500).json({ error: "Khong xoa duoc tai khoan." });
  }
};

const updateUrlAccess = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID khong hop le." });
  }

  const urlAccess = (req.body?.access_url ?? req.body?.url_access ?? "")
    .toString()
    .trim();

  try {
    await db(TABLE)
      .where(COLS.ID, id)
      .update({ [COLS.URL_ACCESS]: urlAccess || null });

    return res.json({ success: true, access_url: urlAccess || null });
  } catch (err) {
    logger.error("[renew-adobe] updateUrlAccess failed", { id, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

const updateAccount = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "ID khong hop le." });
  }

  const allowedFields = {
    email: COLS.EMAIL,
    password_encrypted: COLS.PASSWORD_ENC,
    org_name: COLS.ORG_NAME,
    otp_source: COLS.OTP_SOURCE,
  };

  const updates = {};
  for (const [key, col] of Object.entries(allowedFields)) {
    if (!col || req.body?.[key] === undefined) continue;
    const val = String(req.body[key] ?? "").trim();
    if (key === "email" && (!val || !EMAIL_OK.test(val))) {
      return res.status(400).json({ error: "Email khong hop le." });
    }
    if (key === "otp_source") {
      const normalized = normalizeOtpSource(val, { hasMailBackupId: false });
      updates[col] = normalized === "imap" ? "hdsd" : normalized;
      continue;
    }
    updates[col] = val || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Khong co truong nao de cap nhat." });
  }

  try {
    const [updated] = await db(TABLE)
      .where(COLS.ID, id)
      .update(updates)
      .returning("*");

    if (!updated) {
      return res.status(404).json({ error: "Khong tim thay tai khoan." });
    }

    return res.json({ success: true, account: updated });
  } catch (err) {
    logger.error("[renew-adobe] updateAccount failed", { id, error: err.message });
    return res.status(500).json({ error: "Cap nhat that bai." });
  }
};

module.exports = {
  listMailBackupMailboxes,
  createMailBackupMailbox,
  listAccounts,
  lookupAccountByEmail,
  createAccount,
  deleteAccount,
  updateUrlAccess,
  updateAccount,
};
