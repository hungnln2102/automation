const logger = require("../../utils/logger");
const {
  listMailBackups,
  createMailBackup,
  updateMailBackup,
  deleteMailBackup,
  parseMailBackupLine,
} = require("../../services/mailBackupService");

const listMailBackupMailboxes = async (_req, res) => {
  try {
    const rows = await listMailBackups();
    return res.json(rows);
  } catch (error) {
    logger.error("[mail-backup] list failed", { error: error.message });
    return res.status(500).json({ error: "Khong tai duoc danh sach mail IMAP." });
  }
};

const createMailBackupMailbox = async (req, res) => {
  try {
    const body = req.body ?? {};
    if (body.raw_line && !parseMailBackupLine(body.raw_line)) {
      return res.status(400).json({
        error: "Dong raw_line khong hop le. Dung: email|mat_khau|app_password",
      });
    }
    const parsed = body.raw_line ? parseMailBackupLine(body.raw_line) : null;
    if (parsed?.app_password && parsed.app_password.length !== 16) {
      logger.warn("[mail-backup] app_password length=%s (Gmail thuong la 16 ky tu)", parsed.app_password.length);
    }
    const row = await createMailBackup(body);
    return res.status(201).json(row);
  } catch (error) {
    logger.error("[mail-backup] create failed", { error: error.message });
    return res.status(400).json({ error: error.message || "Khong them duoc mail IMAP." });
  }
};

const updateMailBackupMailbox = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID khong hop le." });
  }
  try {
    const row = await updateMailBackup(id, req.body ?? {});
    if (!row) return res.status(404).json({ error: "Khong tim thay mail IMAP." });
    return res.json(row);
  } catch (error) {
    logger.error("[mail-backup] update failed", { id, error: error.message });
    return res.status(400).json({ error: error.message || "Cap nhat that bai." });
  }
};

const deleteMailBackupMailbox = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID khong hop le." });
  }
  try {
    const ok = await deleteMailBackup(id);
    if (!ok) return res.status(404).json({ error: "Khong tim thay mail IMAP." });
    return res.json({ success: true, id });
  } catch (error) {
    logger.error("[mail-backup] delete failed", { id, error: error.message });
    return res.status(500).json({ error: "Khong xoa duoc mail IMAP." });
  }
};

const testMailBackupMailbox = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "ID khong hop le." });
  }
  try {
    const mailOtpService = require("../../services/mailOtpService");
    const result = await mailOtpService.testImapMailBackup(id);
    return res.json(result);
  } catch (error) {
    logger.error("[mail-backup] test failed", { id, error: error.message });
    return res.status(400).json({ ok: false, error: error.message });
  }
};

module.exports = {
  listMailBackupMailboxes,
  createMailBackupMailbox,
  updateMailBackupMailbox,
  deleteMailBackupMailbox,
  testMailBackupMailbox,
};
