const { db } = require("../db");
const {
  IDENTITY_SCHEMA,
  SCHEMA_MAIL_BACKUP,
  tableName,
} = require("../config/dbSchema");

const MAIL_BACKUP_TABLE = IDENTITY_SCHEMA?.MAIL_BACKUP
  ? tableName(IDENTITY_SCHEMA.MAIL_BACKUP.TABLE, SCHEMA_MAIL_BACKUP)
  : null;
const MB = IDENTITY_SCHEMA?.MAIL_BACKUP?.COLS || {};

function normalizeAppPassword(raw) {
  return String(raw ?? "").replace(/\s+/g, "").trim();
}

function normalizeEmail(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

function parseMailBackupLine(raw) {
  const line = String(raw ?? "").trim();
  if (!line) return null;
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length < 2) return null;
  const email = normalizeEmail(parts[0]);
  if (!email) return null;
  if (parts.length >= 3) {
    return {
      email,
      account_password: parts[1] || null,
      app_password: normalizeAppPassword(parts[2]),
    };
  }
  return {
    email,
    account_password: null,
    app_password: normalizeAppPassword(parts[1]),
  };
}

function maskSecret(value) {
  const s = String(value ?? "");
  if (!s) return "";
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.min(8, s.length - 2))}${s.slice(-2)}`;
}

function toPublicRow(row) {
  if (!row) return null;
  return {
    id: row[MB.ID],
    email: row[MB.EMAIL],
    account_password_set: Boolean(row[MB.ACCOUNT_PASSWORD]),
    app_password_masked: maskSecret(row[MB.APP_PASSWORD]),
    note: row[MB.NOTE] ?? null,
    provider: row[MB.PROVIDER] ?? "gmail",
    alias_prefix: row[MB.ALIAS_PREFIX] ?? null,
    is_active: row[MB.IS_ACTIVE] !== false,
    is_default: row[MB.IS_DEFAULT] === true,
    created_at: row[MB.CREATED_AT] ?? null,
    updated_at: row[MB.UPDATED_AT] ?? null,
  };
}

async function clearOtherDefaults(exceptId = null, trx = db) {
  if (!MAIL_BACKUP_TABLE || !MB.IS_DEFAULT) return;
  let q = trx(MAIL_BACKUP_TABLE).where(MB.IS_DEFAULT, true);
  if (exceptId != null) q = q.whereNot(MB.ID, exceptId);
  await q.update({ [MB.IS_DEFAULT]: false, [MB.UPDATED_AT]: trx.fn.now() });
}

async function listMailBackups() {
  if (!MAIL_BACKUP_TABLE) return [];
  const rows = await db(MAIL_BACKUP_TABLE).orderBy(MB.ID, "asc");
  return rows.map(toPublicRow);
}

async function getMailBackupById(id) {
  if (!MAIL_BACKUP_TABLE || !id) return null;
  const row = await db(MAIL_BACKUP_TABLE).where(MB.ID, id).first();
  return row || null;
}

async function getDefaultActiveMailBackupId() {
  if (!MAIL_BACKUP_TABLE) return null;
  const row = await db(MAIL_BACKUP_TABLE)
    .where(MB.IS_ACTIVE, true)
    .orderBy(MB.IS_DEFAULT, "desc")
    .orderBy(MB.ID, "asc")
    .first();
  return row?.[MB.ID] ?? null;
}

async function resolveMailBackupIdForAccount(account) {
  const { COLS } = require("../controllers/RenewAdobeController/accountTable");
  const linkedId =
    COLS.MAIL_BACKUP_ID && account?.[COLS.MAIL_BACKUP_ID] != null
      ? Number(account[COLS.MAIL_BACKUP_ID])
      : null;
  if (Number.isFinite(linkedId) && linkedId > 0) {
    const row = await getMailBackupById(linkedId);
    if (row && row[MB.IS_ACTIVE] !== false) return linkedId;
  }

  const otpSource =
    COLS.OTP_SOURCE && account?.[COLS.OTP_SOURCE]
      ? String(account[COLS.OTP_SOURCE]).trim().toLowerCase()
      : "imap";
  if (otpSource !== "imap") return null;
  return getDefaultActiveMailBackupId();
}

async function createMailBackup(payload) {
  if (!MAIL_BACKUP_TABLE) throw new Error("mail_backup table chua cau hinh schema.");
  const parsed = payload.raw_line ? parseMailBackupLine(payload.raw_line) : null;
  const email = normalizeEmail(parsed?.email ?? payload.email);
  const appPassword = normalizeAppPassword(parsed?.app_password ?? payload.app_password);
  const accountPassword = String(
    parsed?.account_password ?? payload.account_password ?? ""
  ).trim();

  if (!email) throw new Error("Thieu email.");
  if (!appPassword) throw new Error("Thieu app_password.");

  const providerNorm = String(payload.provider ?? parsed?.provider ?? "gmail").trim() || "gmail";
  if (providerNorm.toLowerCase().includes("gmail") && appPassword.length !== 16) {
    throw new Error(
      `Gmail App Password phai dung 16 ky tu (hien ${appPassword.length}). Tao tai Google Account > Bao mat > Mat khau ung dung.`
    );
  }

  const isDefault = payload.is_default === true;
  const row = {
    [MB.EMAIL]: email,
    [MB.ACCOUNT_PASSWORD]: accountPassword || null,
    [MB.APP_PASSWORD]: appPassword,
    [MB.NOTE]: String(payload.note ?? "").trim() || null,
    [MB.PROVIDER]: String(payload.provider ?? "gmail").trim() || "gmail",
    [MB.ALIAS_PREFIX]: String(payload.alias_prefix ?? "").trim() || null,
    [MB.IS_ACTIVE]: payload.is_active !== false,
    [MB.IS_DEFAULT]: isDefault,
    [MB.CREATED_AT]: db.fn.now(),
    [MB.UPDATED_AT]: db.fn.now(),
  };

  return db.transaction(async (trx) => {
    if (isDefault) await clearOtherDefaults(null, trx);
    const [inserted] = await trx(MAIL_BACKUP_TABLE).insert(row).returning("*");
    return toPublicRow(inserted);
  });
}

async function updateMailBackup(id, payload) {
  if (!MAIL_BACKUP_TABLE) throw new Error("mail_backup table chua cau hinh schema.");
  const existing = await getMailBackupById(id);
  if (!existing) return null;

  const updates = { [MB.UPDATED_AT]: db.fn.now() };
  if (payload.email !== undefined) {
    const email = normalizeEmail(payload.email);
    if (!email) throw new Error("Email khong hop le.");
    updates[MB.EMAIL] = email;
  }
  if (payload.account_password !== undefined) {
    updates[MB.ACCOUNT_PASSWORD] = String(payload.account_password ?? "").trim() || null;
  }
  if (payload.app_password !== undefined) {
    const appPassword = normalizeAppPassword(payload.app_password);
    if (!appPassword) throw new Error("app_password khong hop le.");
    updates[MB.APP_PASSWORD] = appPassword;
  }
  if (payload.note !== undefined) updates[MB.NOTE] = String(payload.note ?? "").trim() || null;
  if (payload.provider !== undefined) {
    updates[MB.PROVIDER] = String(payload.provider ?? "gmail").trim() || "gmail";
  }
  if (payload.alias_prefix !== undefined) {
    updates[MB.ALIAS_PREFIX] = String(payload.alias_prefix ?? "").trim() || null;
  }
  if (payload.is_active !== undefined) updates[MB.IS_ACTIVE] = payload.is_active === true;
  if (payload.is_default !== undefined) updates[MB.IS_DEFAULT] = payload.is_default === true;

  return db.transaction(async (trx) => {
    if (payload.is_default === true) await clearOtherDefaults(id, trx);
    const [updated] = await trx(MAIL_BACKUP_TABLE)
      .where(MB.ID, id)
      .update(updates)
      .returning("*");
    return toPublicRow(updated);
  });
}

async function deleteMailBackup(id) {
  if (!MAIL_BACKUP_TABLE) return false;
  const deleted = await db(MAIL_BACKUP_TABLE).where(MB.ID, id).del();
  return deleted > 0;
}

module.exports = {
  parseMailBackupLine,
  listMailBackups,
  getMailBackupById,
  getDefaultActiveMailBackupId,
  resolveMailBackupIdForAccount,
  createMailBackup,
  updateMailBackup,
  deleteMailBackup,
  toPublicRow,
  MAIL_BACKUP_TABLE,
  MB_COLS: MB,
};
