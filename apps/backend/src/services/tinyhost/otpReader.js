/**
 * Luồng đọc OTP email từ TinyHost.
 * Dùng cho các flow cần nhận OTP qua email tạm (Adobe, v.v.)
 *
 * Luồng:
 * 1. parseAddress("user@domain.com") → { user, domain }
 * 2. waitForEmail() — polling chờ email mới
 * 3. extractOtp(email) — trích OTP từ body/subject
 * 4. deleteEmail() — xóa sau khi dùng
 */

const { listEmails, getEmail, deleteEmail, waitForEmail } = require("./client");
const logger = require("../../utils/logger");

function parseAddress(emailAddress) {
  const trimmed = String(emailAddress || "").trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at >= trimmed.length - 1) {
    throw new Error(`Email không hợp lệ: ${trimmed}`);
  }
  return {
    user: trimmed.slice(0, at),
    domain: trimmed.slice(at + 1),
  };
}

const OTP_PATTERNS = [
  /\b(\d{4,8})\b/,
  /code[:\s]*(\d{4,8})/i,
  /mã[:\s]*(\d{4,8})/i,
  /OTP[:\s]*(\d{4,8})/i,
  /verification[:\s]*(\d{4,8})/i,
];

function extractOtp(email, { patterns = OTP_PATTERNS } = {}) {
  const sources = [
    email?.subject || "",
    email?.body || "",
    email?.html_body || "",
  ].join(" ");

  for (const pattern of patterns) {
    const match = sources.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Luồng đầy đủ: chờ email OTP → đọc → trích OTP → xóa email.
 *
 * @param {string} emailAddress - "user@domain.com"
 * @param {{ senderFilter?: string, subjectFilter?: string, timeoutMs?: number, autoDelete?: boolean }} opts
 * @returns {Promise<{ otp: string|null, email: object|null, error?: string }>}
 */
async function readOtpFromTinyHost(emailAddress, {
  senderFilter,
  subjectFilter,
  timeoutMs = 120_000,
  autoDelete = true,
} = {}) {
  const { user, domain } = parseAddress(emailAddress);

  logger.info("[TinyHost] Waiting for OTP email", { emailAddress, domain, user, timeoutMs });

  const filter = (email) => {
    if (senderFilter && !String(email.sender || "").toLowerCase().includes(senderFilter.toLowerCase())) {
      return false;
    }
    if (subjectFilter && !String(email.subject || "").toLowerCase().includes(subjectFilter.toLowerCase())) {
      return false;
    }
    return true;
  };

  const matched = await waitForEmail(domain, user, { filter, timeoutMs });

  if (!matched) {
    logger.warn("[TinyHost] No matching email found within timeout", { emailAddress, timeoutMs });
    return { otp: null, email: null, error: "Không nhận được email trong thời gian chờ." };
  }

  let detail = matched;
  if (!matched.body && !matched.html_body) {
    detail = await getEmail(domain, user, matched.id);
  }

  const otp = extractOtp(detail);

  logger.info("[TinyHost] OTP extraction result", {
    emailAddress,
    emailId: matched.id,
    subject: matched.subject,
    otpFound: !!otp,
  });

  if (autoDelete) {
    try {
      await deleteEmail(domain, user, matched.id);
      logger.info("[TinyHost] Email deleted after OTP read", { emailId: matched.id });
    } catch (err) {
      logger.warn("[TinyHost] Failed to delete email", { emailId: matched.id, error: err.message });
    }
  }

  return { otp, email: detail };
}

/**
 * Đọc tất cả email, trả danh sách + xóa nếu cần.
 */
async function readAndCleanup(emailAddress, { autoDelete = false } = {}) {
  const { user, domain } = parseAddress(emailAddress);
  const result = await listEmails(domain, user, { page: 1, limit: 100 });
  const emails = result.emails || [];

  if (autoDelete && emails.length > 0) {
    for (const email of emails) {
      try {
        await deleteEmail(domain, user, email.id);
      } catch {
        // skip
      }
    }
    logger.info("[TinyHost] Cleaned up emails", { emailAddress, count: emails.length });
  }

  return emails;
}

module.exports = {
  parseAddress,
  extractOtp,
  readOtpFromTinyHost,
  readAndCleanup,
};
