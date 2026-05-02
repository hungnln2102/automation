const logger = require("../../utils/logger");
const {
  assignUserToAvailableAccount,
  fixUsersAllRoundsTightest,
} = require("../../services/renew-adobe/fixUserAssignmentService");

function fixUserExpectableErrorMessage(msg) {
  const s = String(msg || "");
  return (
    s.includes("đầy slot") ||
    s.includes("hết slot") ||
    s.includes("Không có tài khoản nào còn gói và còn slot") ||
    s.includes("Không còn tài khoản thử thêm")
  );
}

const fixSingleUser = async (req, res) => {
  const userEmail = (req.body?.email || "").toString().trim().toLowerCase();
  if (!userEmail) {
    return res.status(400).json({ success: false, error: "Thiếu email." });
  }

  try {
    const assigned = await assignUserToAvailableAccount(userEmail);

    if (assigned.alreadyLinked) {
      return res.json({
        success: true,
        already_on_adobe: true,
        message:
          "User đã có org khớp với admin (không cần fix). Chạy Check nếu trạng thái chưa đúng.",
        profile: assigned.profileName ?? "—",
      });
    }

    return res.json({
      success: true,
      message: `Đã gán ${userEmail} vào ${assigned.accountEmail}.`,
      accountId: assigned.accountId,
      accountEmail: assigned.accountEmail,
      profile: assigned.profileName ?? "—",
    });
  } catch (err) {
    const msg = err?.message || String(err);
    const expectable = fixUserExpectableErrorMessage(msg);
    (expectable ? logger.warn : logger.error)("[renew-adobe] fixSingleUser failed", {
      email: userEmail,
      error: msg,
    });
    return res.status(expectable ? 409 : 500).json({
      success: false,
      error: msg,
    });
  }
};

const fixUsersRound = async (req, res) => {
  const emailsRaw = req.body?.emails;
  if (!Array.isArray(emailsRaw)) {
    return res.status(400).json({
      success: false,
      error: "Thiếu emails (mảng).",
      remaining_emails: [],
    });
  }

  try {
    const result = await fixUsersAllRoundsTightest(emailsRaw);
    return res.json(result);
  } catch (err) {
    logger.error("[renew-adobe] fixUsersRound failed", { error: err.message });
    return res.status(500).json({
      success: false,
      error: err.message,
      added_count: 0,
      total_added: 0,
      remaining_emails: emailsRaw,
      rounds: [],
    });
  }
};

module.exports = {
  fixSingleUser,
  fixUsersRound,
};
