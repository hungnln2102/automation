const { db } = require("../../db");
const logger = require("../../utils/logger");
const {
  fetchOtpBySource,
  normalizeOtpSource,
} = require("../../services/otpProviderService");
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

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeListUserOtpSource(raw) {
  const requestedOtpSource = normalizeOtpSource(raw, { hasMailBackupId: false });
  return requestedOtpSource === "imap" ? "hdsd" : requestedOtpSource;
}

async function fetchPublicOtpWithRetry({
  accountEmail,
  otpSource,
  oauth,
  attempts = 4,
  intervalMs = 2500,
}) {
  const minTimestampMs = Date.now() - 15_000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const code = await fetchOtpBySource({
      otpSource,
      accountEmail,
      senderFilter: "adobe",
      minTimestampMs,
      oauthRefreshToken: oauth?.refreshToken,
      oauthClientId: oauth?.clientId,
      oauthMailEmail: oauth?.mailEmail,
    });
    if (code) return String(code).trim();
    if (attempt < attempts && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }
  return null;
}

const sendPublicOtp = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ success: false, error: "Thiếu email." });
  }
  if (!EMAIL_OK.test(email)) {
    return res.status(400).json({ success: false, error: "Email không hợp lệ." });
  }

  try {
    const row = await db(TRACK_TABLE)
      .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [TRACK_COLS.ACCOUNT, email])
      .first();

    if (!row) {
      return res.status(404).json({
        success: false,
        error:
          "Email không có trong hệ thống. Vui lòng kiểm tra lại hoặc liên hệ hỗ trợ.",
      });
    }

    const otpSource = normalizeListUserOtpSource(
      row[TRACK_COLS.OTP_SOURCE] ?? req.body?.otp_source ?? "hdsd"
    );

    const code = await fetchPublicOtpWithRetry({
      accountEmail: email,
      otpSource,
      oauth: {
        refreshToken: row[TRACK_COLS.OTP_REFRESH_TOKEN],
        clientId: row[TRACK_COLS.OTP_CLIENT_ID],
        mailEmail: row[TRACK_COLS.OTP_MAIL_EMAIL],
      },
    });

    if (!code) {
      return res.status(404).json({
        success: false,
        message:
          "Chưa lấy được OTP từ hệ thống web. Vui lòng thử lại sau vài giây.",
      });
    }

    logger.info("[renew-adobe/public] OTP fetched for %s via %s", email, otpSource);

    return res.json({
      success: true,
      message: `Đã lấy OTP cho ${email}.`,
      otp: {
        code,
        source: otpSource,
      },
    });
  } catch (error) {
    logger.error("[renew-adobe/public] send OTP failed", {
      email,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: "Không lấy được OTP lúc này. Vui lòng thử lại sau.",
    });
  }
};

module.exports = {
  sendPublicOtp,
};
