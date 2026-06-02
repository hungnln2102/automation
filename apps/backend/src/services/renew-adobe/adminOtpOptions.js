const { COLS } = require("../../controllers/RenewAdobeController/accountTable");
const { resolveMailBackupIdForAccount } = require("../mailBackupService");

function normalizeEmailValue(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  return s || null;
}

function resolveOtpMailEmailFromAccount(account) {
  if (!account || !COLS.OTP_MAIL_EMAIL) return null;
  return normalizeEmailValue(account[COLS.OTP_MAIL_EMAIL]);
}

/** OTP runtime options từ dòng accounts_admin (check / add / delete). */
async function resolveAdminOtpRuntimeOptions(account) {
  const otpSource =
    COLS.OTP_SOURCE && account?.[COLS.OTP_SOURCE]
      ? String(account[COLS.OTP_SOURCE]).trim().toLowerCase()
      : "imap";

  const mailBackupId = await resolveMailBackupIdForAccount(account);

  return {
    mailBackupId: Number.isFinite(mailBackupId) ? mailBackupId : null,
    otpSource,
    otpMailEmail: resolveOtpMailEmailFromAccount(account),
    oauthRefreshToken:
      COLS.OTP_REFRESH_TOKEN && account?.[COLS.OTP_REFRESH_TOKEN]
        ? String(account[COLS.OTP_REFRESH_TOKEN]).trim()
        : null,
    oauthClientId:
      COLS.OTP_CLIENT_ID && account?.[COLS.OTP_CLIENT_ID]
        ? String(account[COLS.OTP_CLIENT_ID]).trim()
        : null,
  };
}

/** Email gửi lên API OTP: mail phụ nếu có, không thì email admin. */
function resolveOtpFetchEmail(adminEmail, otpMailEmail) {
  return normalizeEmailValue(otpMailEmail) || normalizeEmailValue(adminEmail) || "";
}

module.exports = {
  resolveAdminOtpRuntimeOptions,
  resolveOtpFetchEmail,
  resolveOtpMailEmailFromAccount,
};
