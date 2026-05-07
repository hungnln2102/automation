const { db } = require("../../db");
const logger = require("../../utils/logger");
const { TABLE, COLS } = require("./accountTable");
const { findAccountMatchByEmail, normalizeEmail } = require("./accountLookup");
const { normalizeOtpSource } = require("../../services/otpProviderService");
const {
  getOrderUserTrackingCountsForAdminAccounts,
} = require("../../services/renew-adobe/orderUserTrackingService");
const { deleteAdminAccountById } = require("./accountDeletion");

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_ADOBE_ADMIN_PASSWORD = "Adobe123@";

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

function normalizeAccountOtpSource(raw) {
  const requestedOtpSource = normalizeOtpSource(raw, {
    hasMailBackupId: false,
  });
  return requestedOtpSource === "imap" ? "hdsd" : requestedOtpSource;
}

function buildNewAccountRow(email, otpSource) {
  return {
    [COLS.EMAIL]: email,
    [COLS.PASSWORD_ENC]: DEFAULT_ADOBE_ADMIN_PASSWORD,
    [COLS.ORG_NAME]: null,
    [COLS.LICENSE_STATUS]: null,
    [COLS.USER_COUNT]: 0,
    [COLS.LAST_CHECKED]: null,
    [COLS.IS_ACTIVE]: true,
    [COLS.CREATED_AT]: db.fn.now(),
    ...(COLS.OTP_SOURCE ? { [COLS.OTP_SOURCE]: otpSource } : {}),
    ...(COLS.URL_ACCESS ? { [COLS.URL_ACCESS]: null } : {}),
  };
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

  if (!email || !EMAIL_OK.test(email)) {
    return res.status(400).json({ error: "Email khong hop le." });
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

    const otpSource = normalizeAccountOtpSource(req.body?.otp_source);

    const [inserted] = await db(TABLE)
      .insert(buildNewAccountRow(email, otpSource))
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

const createAccountsBulk = async (req, res) => {
  const rawEmails = Array.isArray(req.body?.emails)
    ? req.body.emails
    : String(req.body?.emails ?? req.body?.email ?? "")
        .split(/[\s,;]+/);

  const seen = new Set();
  const invalid = [];
  const emails = [];

  for (const raw of rawEmails) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    if (!EMAIL_OK.test(email)) {
      invalid.push(email);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }

  if (emails.length === 0) {
    return res.status(400).json({
      error: invalid.length > 0 ? "Danh sach email khong hop le." : "Thieu danh sach email.",
      created: [],
      skipped: [],
      invalid,
    });
  }

  try {
    const existingRows = await db(TABLE)
      .select(COLS.EMAIL)
      .whereIn(COLS.EMAIL, emails);
    const existingEmails = new Set(
      existingRows.map((row) => normalizeEmail(row[COLS.EMAIL]))
    );
    const newEmails = emails.filter((email) => !existingEmails.has(email));
    const otpSource = normalizeAccountOtpSource(req.body?.otp_source);

    let inserted = [];
    if (newEmails.length > 0) {
      inserted = await db(TABLE)
        .insert(newEmails.map((email) => buildNewAccountRow(email, otpSource)))
        .returning([COLS.ID, COLS.EMAIL]);
    }

    const created = inserted.map((row, index) => ({
      id: typeof row === "object" ? row[COLS.ID] : row,
      email:
        typeof row === "object" && row[COLS.EMAIL]
          ? row[COLS.EMAIL]
          : newEmails[index],
    }));
    const skipped = emails.filter((email) => existingEmails.has(email));

    logger.info("[renew-adobe] Bulk created admin accounts", {
      created: created.length,
      skipped: skipped.length,
      invalid: invalid.length,
    });

    return res.status(created.length > 0 ? 201 : 200).json({
      success: true,
      created,
      skipped,
      invalid,
      password_default: DEFAULT_ADOBE_ADMIN_PASSWORD,
    });
  } catch (error) {
    logger.error("[renew-adobe] Bulk create accounts failed", {
      error: error.message,
    });
    return res.status(500).json({ error: "Khong the them nhieu tai khoan admin." });
  }
};

const deleteAccount = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID khong hop le." });
  }

  try {
    const result = await deleteAdminAccountById(id, { reason: "manual" });
    if (!result.deleted) {
      return res.status(404).json({ error: "Khong tim thay tai khoan." });
    }

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
  createAccountsBulk,
  deleteAccount,
  updateUrlAccess,
  updateAccount,
};
