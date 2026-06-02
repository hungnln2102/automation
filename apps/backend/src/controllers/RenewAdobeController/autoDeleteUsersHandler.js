/**
 * Xóa user khỏi Adobe (V2), gỡ khỏi list_user, rồi chạy check để cập nhật admin + reconcile còn lại.
 */

const logger = require("../../utils/logger");
const { autoDeleteUsersForAccountId } = require("../../services/renew-adobe/autoDeleteUsersService");

const runAutoDeleteUsers = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, error: "ID không hợp lệ." });
  }

  const userEmails = req.body?.userEmails;
  const list = Array.isArray(userEmails)
    ? userEmails
    : userEmails
      ? [userEmails]
      : [];
  const normalized = list.map((email) => String(email).trim()).filter(Boolean);

  if (normalized.length === 0) {
    return res.status(400).json({ success: false, error: "Thiếu userEmails." });
  }

  try {
    const result = await autoDeleteUsersForAccountId(id, normalized);

    return res.json({
      success: true,
      message: `Đã xử lý: ${result.deleted.length} xóa thành công, ${result.failed.length} lỗi.`,
      deleted: result.deleted,
      failed: result.failed,
      list_user_removed: result.listUserRemoved,
    });
  } catch (err) {
    logger.error("[renew-adobe] Auto-delete users failed", { id, error: err.message });
    return res.status(500).json({
      success: false,
      error: err.message || "Lỗi khi xóa user.",
    });
  }
};

module.exports = { runAutoDeleteUsers };
