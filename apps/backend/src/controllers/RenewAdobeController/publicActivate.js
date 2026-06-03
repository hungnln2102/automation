const logger = require("../../utils/logger");
const {
  assignUserToAvailableAccount,
} = require("../../services/renew-adobe/fixUserAssignmentService");
const { getPublicStatus } = require("./publicStatus");

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * POST /api/renew-adobe/public/activate
 * Body: { email: string }
 *
 * Gán user vào account Adobe admin còn slot, rồi trả về status mới.
 */
const activatePublicProfile = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ success: false, error: "Thiếu email." });
  }
  if (!EMAIL_OK.test(email)) {
    return res.status(400).json({ success: false, error: "Email không hợp lệ." });
  }

  try {
    logger.info("[renew-adobe/public] activate request for %s", email);

    const assigned = await assignUserToAvailableAccount(email, {
      skipLogin: true,
    });

    logger.info("[renew-adobe/public] activate result for %s: %j", email, {
      accountId: assigned.accountId,
      profileName: assigned.profileName,
      alreadyLinked: assigned.alreadyLinked,
    });

    // Sau khi assign xong, trả về status mới bằng cách gọi lại logic status
    // Fake req/res để lấy data
    const statusData = await new Promise((resolve, reject) => {
      const fakeReq = { query: { email } };
      const fakeRes = {
        json: (data) => resolve(data),
        status: (code) => ({
          json: (data) => resolve({ ...data, _httpStatus: code }),
        }),
      };
      getPublicStatus(fakeReq, fakeRes).catch(reject);
    });

    // Nếu status call bị lỗi
    if (statusData._httpStatus && statusData._httpStatus >= 400) {
      delete statusData._httpStatus;
      return res.status(500).json({
        success: false,
        error: statusData.error || "Lỗi kiểm tra sau khi kích hoạt.",
      });
    }

    // Override message cho activate success
    const result = {
      ...statusData,
      success: true,
      message: assigned.alreadyLinked
        ? `Email ${email} đã được gán profile Adobe trước đó.`
        : `Đã kích hoạt profile Adobe cho ${email} thành công.`,
      activatedAccount: assigned.accountId
        ? {
            id: assigned.accountId,
            email: assigned.accountEmail || email,
          }
        : undefined,
    };

    return res.json(result);
  } catch (error) {
    logger.error("[renew-adobe/public] activate failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error:
        error.message || "Không kích hoạt được profile. Vui lòng thử lại sau.",
    });
  }
};

module.exports = {
  activatePublicProfile,
};
