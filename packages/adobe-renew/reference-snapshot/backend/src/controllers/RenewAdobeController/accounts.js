const { db } = require("../../db");
const logger = require("../../utils/logger");
const {
  IDENTITY_SCHEMA,
  SCHEMA_MAIL_BACKUP,
  tableName,
} = require("../../config/dbSchema");
const { TABLE, COLS } = require("./accountTable");
const { findAccountMatchByEmail, normalizeEmail } = require("./accountLookup");
const { removeMappingsForAccount } = require("../../services/userAccountMappingService");
const { normalizeOtpSource } = require("../../services/otpProviderService");
const {
  removeProfileDirForEmail,
} = require("../../services/renew-adobe/adobe-renew-v2/shared/profileSession");
const {
  upsertRenewAdobeOrderUserTrackingForOrderIds,
  getOrderUserTrackingCountsForAdminAccounts,
} = require("../../services/renew-adobe/orderUserTrackingService");

const MAIL_BACKUP_TABLE =
  IDENTITY_SCHEMA?.MAIL_BACKUP
    ? tableName(IDENTITY_SCHEMA.MAIL_BACKUP.TABLE, SCHEMA_MAIL_BACKUP)
    : null;
const MB_COLS = IDENTITY_SCHEMA?.MAIL_BACKUP?.COLS || {};

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CHECK_EMPTY_COLS = [
  COLS.EMAIL,
  COLS.PASSWORD_ENC,
  COLS.ORG_NAME,
  COLS.LICENSE_STATUS,
  COLS.USER_COUNT,
  COLS.LAST_CHECKED,
  COLS.IS_ACTIVE,
  COLS.CREATED_AT,
];

function isValueEmpty(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return String(value).trim() === "";
  }
  if (typeof value === "number") {
    return false;
  }
  if (typeof value === "boolean") {
    return false;
  }
  if (value instanceof Date) {
    return false;
  }
  return true;
}

function getEmptyFields(row) {
  const empty = [];
  for (const col of CHECK_EMPTY_COLS) {
    if (isValueEmpty(row[col])) {
      empty.push(col);
    }
  }
  return empty;
}

function trimStr(value) {
  return value == null ? "" : String(value).trim();
}

const listMailBackupMailboxes = async (req, res) => {
  if (!MAIL_BACKUP_TABLE || !MB_COLS.ID) {
    return res.json([]);
  }
  try {
    const excludeAssigned =
      req.query?.exclude_assigned === "1" ||
      req.query?.exclude_assigned === "true";

    const cols = [
      MB_COLS.ID,
      MB_COLS.EMAIL,
      MB_COLS.NOTE,
      ...(MB_COLS.ALIAS_PREFIX ? [MB_COLS.ALIAS_PREFIX] : []),
    ];
    let query = db(MAIL_BACKUP_TABLE)
      .select(...cols)
      .where(MB_COLS.IS_ACTIVE, true);

    if (excludeAssigned && COLS.MAIL_BACKUP_ID) {
      const usedRaw = await db(TABLE)
        .whereNotNull(COLS.MAIL_BACKUP_ID)
        .pluck(COLS.MAIL_BACKUP_ID);
      const usedIds = [
        ...new Set(
          usedRaw
            .map((id) => Number(id))
            .filter((n) => Number.isFinite(n) && n > 0)
        ),
      ];
      if (usedIds.length) {
        query = query.whereNotIn(MB_COLS.ID, usedIds);
      }
    }

    const rows = await query.orderBy(MB_COLS.ID, "desc");
    const list = rows.map((r) => {
      const ap = MB_COLS.ALIAS_PREFIX
        ? trimStr(r[MB_COLS.ALIAS_PREFIX])
        : "";
      return {
        id: Number(r[MB_COLS.ID]),
        email: trimStr(r[MB_COLS.EMAIL]),
        alias_prefix: ap !== "" ? ap : null,
        note:
          r[MB_COLS.NOTE] != null && trimStr(r[MB_COLS.NOTE]) !== ""
            ? trimStr(r[MB_COLS.NOTE])
            : null,
      };
    });
    return res.json(list);
  } catch (err) {
    logger.error("[renew-adobe] listMailBackupMailboxes failed", {
      error: err.message,
    });
    return res
      .status(500)
      .json({ error: "Không tải được danh sách mail dự phòng." });
  }
};

/**
 * Tạo dòng mail_backup mới: bắt buộc alias_prefix; email / app_password / provider / note
 * không gửi thì copy từ một dòng mẫu đang active (cùng hộp IMAP, khác alias lọc OTP).
 */
const createMailBackupMailbox = async (req, res) => {
  if (!MAIL_BACKUP_TABLE || !MB_COLS.ID) {
    return res.status(400).json({ error: "Chưa cấu hình bảng mail_backup." });
  }
  if (!MB_COLS.ALIAS_PREFIX) {
    return res.status(400).json({
      error: "CSDL chưa có cột alias_prefix cho mail_backup.",
    });
  }

  const aliasPrefix = trimStr(req.body?.alias_prefix);
  if (!aliasPrefix) {
    return res.status(400).json({ error: "Thiếu alias_prefix." });
  }

  try {
    const dup = await db(MAIL_BACKUP_TABLE)
      .whereRaw(`lower(trim(coalesce(??, ''))) = ?`, [
        MB_COLS.ALIAS_PREFIX,
        aliasPrefix.toLowerCase(),
      ])
      .first();
    if (dup) {
      return res.status(409).json({
        error: "alias_prefix này đã tồn tại.",
      });
    }

    const template = await db(MAIL_BACKUP_TABLE)
      .where(MB_COLS.IS_ACTIVE, true)
      .whereNotNull(MB_COLS.EMAIL)
      .whereNotNull(MB_COLS.APP_PASSWORD)
      .orderBy(MB_COLS.ID, "asc")
      .first();

    if (
      !template ||
      !trimStr(template[MB_COLS.EMAIL]) ||
      !trimStr(template[MB_COLS.APP_PASSWORD])
    ) {
      return res.status(400).json({
        error:
          "Chưa có dòng mail_backup mẫu (email + app_password). Thêm một dòng đầy đủ trong DB trước, sau đó chỉ cần nhập alias_prefix cho các dòng tiếp theo.",
      });
    }

    const fromBodyOrTemplate = (bodyKey, colKey) => {
      const raw = req.body?.[bodyKey];
      const t = trimStr(raw);
      if (t !== "") return t;
      const fromT = template[colKey];
      return fromT != null ? trimStr(fromT) : "";
    };

    const email = fromBodyOrTemplate("email", MB_COLS.EMAIL);
    const appPassword = fromBodyOrTemplate(
      "app_password",
      MB_COLS.APP_PASSWORD
    );
    const provider = fromBodyOrTemplate("provider", MB_COLS.PROVIDER);
    const noteRaw = req.body?.note;
    const note =
      noteRaw !== undefined && noteRaw !== null && trimStr(noteRaw) !== ""
        ? trimStr(noteRaw)
        : template[MB_COLS.NOTE] != null
        ? trimStr(template[MB_COLS.NOTE]) || null
        : null;

    if (!email || !appPassword) {
      return res.status(400).json({
        error: "Thiếu email hoặc app_password (và không lấy được từ dòng mẫu).",
      });
    }

    const insertPayload = {
      [MB_COLS.EMAIL]: email,
      [MB_COLS.APP_PASSWORD]: appPassword,
      [MB_COLS.PROVIDER]: provider || "gmail",
      [MB_COLS.NOTE]: note || null,
      [MB_COLS.IS_ACTIVE]: true,
      [MB_COLS.ALIAS_PREFIX]: aliasPrefix,
      [MB_COLS.CREATED_AT]: db.fn.now(),
      [MB_COLS.UPDATED_AT]: db.fn.now(),
    };

    const [inserted] = await db(MAIL_BACKUP_TABLE)
      .insert(insertPayload)
      .returning(MB_COLS.ID);

    const newId =
      inserted && typeof inserted === "object"
        ? inserted[MB_COLS.ID]
        : inserted;

    logger.info("[renew-adobe] Created mail_backup row", {
      id: newId,
      alias_prefix: aliasPrefix,
    });
    return res.status(201).json({
      success: true,
      id: Number(newId),
      alias_prefix: aliasPrefix,
    });
  } catch (err) {
    const code = err?.code;
    if (code === "23505") {
      return res.status(409).json({ error: "alias_prefix hoặc email trùng." });
    }
    logger.error("[renew-adobe] createMailBackupMailbox failed", {
      error: err.message,
    });
    return res.status(500).json({ error: "Không tạo được hộp thư mail_backup." });
  }
};

const listAccounts = async (_req, res) => {
  try {
    const baseSelect = [
      `${TABLE}.${COLS.ID}`,
      `${TABLE}.${COLS.EMAIL}`,
      `${TABLE}.${COLS.PASSWORD_ENC}`,
      `${TABLE}.${COLS.ORG_NAME}`,
      `${TABLE}.${COLS.LICENSE_STATUS}`,
      `${TABLE}.${COLS.USER_COUNT}`,
      `${TABLE}.${COLS.LAST_CHECKED}`,
      `${TABLE}.${COLS.IS_ACTIVE}`,
      `${TABLE}.${COLS.CREATED_AT}`,
      `${TABLE}.${COLS.MAIL_BACKUP_ID}`,
      ...(COLS.OTP_SOURCE ? [`${TABLE}.${COLS.OTP_SOURCE}`] : []),
      ...(COLS.URL_ACCESS ? [`${TABLE}.${COLS.URL_ACCESS}`] : []),
      ...(COLS.ID_PRODUCT ? [`${TABLE}.${COLS.ID_PRODUCT}`] : []),
    ];

    let qb = db(TABLE);
    if (MAIL_BACKUP_TABLE && MB_COLS.ALIAS_PREFIX) {
      qb = qb
        .leftJoin(
          MAIL_BACKUP_TABLE,
          `${TABLE}.${COLS.MAIL_BACKUP_ID}`,
          `${MAIL_BACKUP_TABLE}.${MB_COLS.ID}`
        )
        .select(
          ...baseSelect,
          `${MAIL_BACKUP_TABLE}.${MB_COLS.ALIAS_PREFIX} as alias`
        );
    } else {
      qb = qb.select(...baseSelect, db.raw("NULL::text as alias"));
    }

    const rows = await qb.orderBy(`${TABLE}.${COLS.ID}`, "asc");

    const trackingByAccountId = await getOrderUserTrackingCountsForAdminAccounts(
      rows,
      COLS.ID,
      COLS.ORG_NAME
    );

    const withEmptyCheck = rows.map((row) => ({
      ...row,
      empty_fields: getEmptyFields(row),
      tracking_user_count:
        trackingByAccountId.get(Number(row[COLS.ID])) ?? 0,
    }));

    logger.info("[renew-adobe] List accounts", { total: withEmptyCheck.length });
    return res.json(withEmptyCheck);
  } catch (error) {
    logger.error("[renew-adobe] List accounts failed", {
      error: error.message,
    });
    return res
      .status(500)
      .json({ error: "Không thể tải danh sách tài khoản Renew Adobe." });
  }
};

const lookupAccountByEmail = async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ error: "Thiếu tham số email." });
  }

  try {
    const { account: row } = await findAccountMatchByEmail(email);

    if (!row) {
      return res.status(404).json({
        error: "Không tìm thấy tài khoản với email tương ứng.",
        account: null,
      });
    }

    return res.json({ account: row });
  } catch (error) {
    logger.error("[renew-adobe] Lookup account failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({
      error: "Lỗi tra cứu tài khoản.",
      account: null,
    });
  }
};

const createAccount = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = (req.body?.password ?? "").toString();

  if (!email || !EMAIL_OK.test(email)) {
    return res.status(400).json({ error: "Email không hợp lệ." });
  }
  if (!password.trim()) {
    return res.status(400).json({ error: "Thiếu mật khẩu." });
  }

  try {
    let resolvedMailBackupId = null;
    const rawMb = req.body?.mail_backup_id;
    if (rawMb !== undefined && rawMb !== null && String(rawMb).trim() !== "") {
      const n = parseInt(String(rawMb), 10);
      if (!Number.isFinite(n) || n < 1) {
        return res
          .status(400)
          .json({ error: "Mail dự phòng (ID) không hợp lệ." });
      }
      if (!MAIL_BACKUP_TABLE) {
        return res.status(400).json({
          error: "Hệ thống chưa cấu hình bảng mail_backup.",
        });
      }
      const mbRow = await db(MAIL_BACKUP_TABLE)
        .where(MB_COLS.ID, n)
        .where(MB_COLS.IS_ACTIVE, true)
        .first();
      if (!mbRow) {
        return res.status(400).json({
          error: "Mail dự phòng không tồn tại hoặc đã tắt.",
        });
      }
      resolvedMailBackupId = n;
    }

    const existing = await db(TABLE).where(COLS.EMAIL, email).first();
    if (existing) {
      return res
        .status(409)
        .json({ error: "Email này đã có trong danh sách tài khoản admin." });
    }

    const otpSource = normalizeOtpSource(req.body?.otp_source, {
      hasMailBackupId: Number.isFinite(resolvedMailBackupId),
    });
    if (otpSource === "imap" && !Number.isFinite(resolvedMailBackupId)) {
      return res.status(400).json({
        error:
          "Nguồn OTP là IMAP thì bắt buộc phải chọn Alias (mail dự phòng).",
      });
    }

    const [inserted] = await db(TABLE)
      .insert({
        [COLS.EMAIL]: email,
        [COLS.PASSWORD_ENC]: password,
        [COLS.ORG_NAME]: null,
        [COLS.LICENSE_STATUS]: null,
        [COLS.USER_COUNT]: 0,
        [COLS.ALERT_CONFIG]: null,
        [COLS.LAST_CHECKED]: null,
        [COLS.IS_ACTIVE]: true,
        [COLS.CREATED_AT]: db.fn.now(),
        [COLS.MAIL_BACKUP_ID]: resolvedMailBackupId,
        ...(COLS.OTP_SOURCE ? { [COLS.OTP_SOURCE]: otpSource } : {}),
        ...(COLS.URL_ACCESS ? { [COLS.URL_ACCESS]: null } : {}),
      })
      .returning(COLS.ID);

    const id =
      inserted && typeof inserted === "object"
        ? inserted[COLS.ID]
        : inserted;

    logger.info("[renew-adobe] Created admin account", { id, email });
    return res.status(201).json({ success: true, id });
  } catch (error) {
    const code = error?.code;
    if (code === "23505") {
      return res
        .status(409)
        .json({ error: "Email này đã có trong danh sách tài khoản admin." });
    }
    logger.error("[renew-adobe] Create account failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({
      error: "Không thể thêm tài khoản admin.",
    });
  }
};

const deleteAccount = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID không hợp lệ." });
  }

  try {
    const row = await db(TABLE).where(COLS.ID, id).first();
    if (!row) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản." });
    }

    const removedMappings = await removeMappingsForAccount(id);
    const trackingOrderIds = [
      ...new Set(
        removedMappings
          .map((r) => String(r.id_order ?? "").trim())
          .filter(Boolean)
      ),
    ];

    const deleted = await db(TABLE).where(COLS.ID, id).del();

    if (!deleted) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản." });
    }

    if (trackingOrderIds.length > 0) {
      await upsertRenewAdobeOrderUserTrackingForOrderIds(trackingOrderIds).catch(
        (err) => {
          logger.warn("[renew-adobe] deleteAccount order_user_tracking: %s", err.message);
        }
      );
    }

    logger.info("[renew-adobe] Deleted admin account", {
      id,
      email: trimStr(row[COLS.EMAIL]),
    });
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
    return res.json({ success: true, id });
  } catch (err) {
    logger.error("[renew-adobe] deleteAccount failed", {
      id,
      error: err.message,
    });
    return res.status(500).json({
      error: "Không xóa được tài khoản.",
    });
  }
};

const updateUrlAccess = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID không hợp lệ." });
  }

  const urlAccess = (req.body?.access_url ?? req.body?.url_access ?? "").toString().trim();

  try {
    await db(TABLE)
      .where(COLS.ID, id)
      .update({ [COLS.URL_ACCESS]: urlAccess || null });

    return res.json({ success: true, access_url: urlAccess || null });
  } catch (err) {
    logger.error("[renew-adobe] updateUrlAccess failed", {
      id,
      error: err.message,
    });
    return res.status(500).json({ success: false, error: err.message });
  }
};

const updateAccount = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "ID không hợp lệ." });
  }

  const allowedFields = {
    email: COLS.EMAIL,
    password_encrypted: COLS.PASSWORD_ENC,
    org_name: COLS.ORG_NAME,
    otp_source: COLS.OTP_SOURCE,
  };

  const updates = {};
  for (const [key, col] of Object.entries(allowedFields)) {
    if (req.body?.[key] !== undefined) {
      const val = String(req.body[key] ?? "").trim();
      if (key === "email") {
        if (!val || !EMAIL_OK.test(val)) {
          return res.status(400).json({ error: "Email không hợp lệ." });
        }
      }
      if (key === "otp_source") {
        updates[col] = normalizeOtpSource(val);
        continue;
      }
      updates[col] = val || null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Không có trường nào để cập nhật." });
  }

  try {
    const [updated] = await db(TABLE)
      .where(COLS.ID, id)
      .update(updates)
      .returning("*");

    if (!updated) {
      return res.status(404).json({ error: "Không tìm thấy tài khoản." });
    }

    return res.json({ success: true, account: updated });
  } catch (err) {
    logger.error("[renew-adobe] updateAccount failed", { id, error: err.message });
    return res.status(500).json({ error: "Cập nhật thất bại." });
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
