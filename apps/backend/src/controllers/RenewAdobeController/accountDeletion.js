const { db } = require("../../db");
const logger = require("../../utils/logger");
const { TABLE, COLS } = require("./accountTable");
const {
  removeProfileDirForEmail,
} = require("../../services/renew-adobe/adobe-renew-v2/shared/profileSession");

function trimStr(value) {
  return value == null ? "" : String(value).trim();
}

async function deleteAdminAccountById(id, options = {}) {
  const reason = options.reason || "manual";
  const row = await db(TABLE).where(COLS.ID, id).first();
  if (!row) {
    return { deleted: false, row: null, reason: "not_found" };
  }

  const deleted = await db(TABLE).where(COLS.ID, id).del();
  if (!deleted) {
    return { deleted: false, row, reason: "not_found" };
  }

  try {
    const clean = removeProfileDirForEmail(row[COLS.EMAIL]);
    if (clean.removed) {
      logger.info("[renew-adobe] Deleted local profile dir", {
        id,
        email: trimStr(row[COLS.EMAIL]),
        profileDir: clean.profileDir,
        reason,
      });
    }
  } catch (profileErr) {
    logger.warn("[renew-adobe] delete account profile cleanup failed", {
      id,
      email: trimStr(row[COLS.EMAIL]),
      error: profileErr.message,
      reason,
    });
  }

  logger.info("[renew-adobe] Deleted admin account", {
    id,
    email: trimStr(row[COLS.EMAIL]),
    reason,
  });

  return { deleted: true, row, reason };
}

module.exports = {
  deleteAdminAccountById,
};
