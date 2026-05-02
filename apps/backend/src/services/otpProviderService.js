const logger = require("../utils/logger");
const mailOtpService = require("./mailOtpService");
const { readOtpFromTinyHost } = require("./tinyhost");

const OTP_SOURCES = {
  IMAP: "imap",
  TINYHOST: "tinyhost",
  HDSD: "hdsd",
};

function normalizeOtpSource(rawValue, { hasMailBackupId = false } = {}) {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase();

  if (
    normalized === OTP_SOURCES.IMAP ||
    normalized === OTP_SOURCES.TINYHOST ||
    normalized === OTP_SOURCES.HDSD
  ) {
    return normalized;
  }

  // Fallback for old rows: if account is linked to alias/mail_backup, default to IMAP.
  if (hasMailBackupId) {
    return OTP_SOURCES.IMAP;
  }
  return OTP_SOURCES.IMAP;
}

function extractOtpCode(raw) {
  if (raw == null) return null;
  const str = String(raw);
  const direct = str.match(/\b(\d{4,8})\b/);
  if (direct?.[1]) return direct[1];
  return null;
}

function collectOtpCandidates(obj, out = [], parentKey = "") {
  if (obj == null) return out;
  if (typeof obj === "string") {
    out.push(obj);
    return out;
  }
  if (typeof obj === "number") {
    if (/otp|code|token|verification|value/i.test(parentKey)) {
      out.push(String(obj));
    }
    return out;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectOtpCandidates(item, out, parentKey);
    return out;
  }
  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      if (/otp|code|token|verification/i.test(key)) {
        out.push(value);
      }
      collectOtpCandidates(value, out, key);
    }
  }
  return out;
}

function resolveHdsdRows(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.data)) return data.data;
    if (data.data && Array.isArray(data.data.rows)) return data.data.rows;
    if (Array.isArray(data.mails)) return data.mails;
  }
  return [];
}

async function fetchOtpFromHdsdApi({
  accountEmail,
  timeoutMs = 10000,
  senderFilter = "adobe",
  minTimestampMs = null,
}) {
  const baseUrl = process.env.OTP_HDSD_BASE_URL || "https://otp.hdsd.net";
  const endpoint =
    process.env.OTP_HDSD_ENDPOINT || "/get_otp_api";
  const token = process.env.OTP_HDSD_TOKEN || "";

  const url = new URL(endpoint, baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: accountEmail || "" }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn(
        "[otp-provider] HDSD API returned non-200: %s",
        response.status
      );
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => null);
      const rows = resolveHdsdRows(data);
      const hasRows = rows.length > 0;
      if (rows.length > 0) {
        for (const row of rows) {
          const service = String(row?.service || row?.provider || "").toLowerCase();
          const type = String(row?.type || row?.kind || "").toLowerCase();
          if (senderFilter && service && !service.includes(String(senderFilter).toLowerCase())) {
            continue;
          }
          if (type === "warning" || type === "link") continue;
          const rowTimestamp = Number.parseInt(
            String(row?.timestamp_ms ?? row?.timestamp ?? ""),
            10
          );
          if (Number.isFinite(minTimestampMs) && Number.isFinite(rowTimestamp)) {
            if (rowTimestamp < Number(minTimestampMs)) continue;
          }
          const code = extractOtpCode(row?.value ?? row?.otp ?? row?.code);
          if (code) return code;
        }
      }
      // Nếu payload có rows nhưng không row nào đạt điều kiện thời gian mới,
      // không fallback sang quét toàn payload để tránh lấy lại OTP cũ.
      if (hasRows && Number.isFinite(minTimestampMs)) {
        return null;
      }
      const candidates = collectOtpCandidates(data);
      for (const candidate of candidates) {
        const code = extractOtpCode(candidate);
        if (code) return code;
      }
      return null;
    }

    const text = await response.text().catch(() => "");
    return extractOtpCode(text);
  } catch (error) {
    logger.warn("[otp-provider] HDSD API read failed: %s", error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOtpBySource({
  otpSource,
  mailBackupId = null,
  accountEmail = "",
  senderFilter = "adobe",
  minTimestampMs = null,
}) {
  const normalizedSource = normalizeOtpSource(otpSource, {
    hasMailBackupId: Number.isFinite(Number(mailBackupId)),
  });

  if (normalizedSource === OTP_SOURCES.TINYHOST) {
    if (!accountEmail) return null;
    const result = await readOtpFromTinyHost(accountEmail, {
      senderFilter,
      timeoutMs: 10000,
      autoDelete: true,
    });
    return result?.otp || null;
  }

  if (normalizedSource === OTP_SOURCES.HDSD) {
    return fetchOtpFromHdsdApi({
      accountEmail,
      senderFilter,
      timeoutMs: 10000,
      minTimestampMs,
    });
  }

  if (mailBackupId) {
    return mailOtpService.fetchOtpFromEmail(mailBackupId, {
      useEnvFallback: false,
      senderFilter,
    });
  }
  return mailOtpService.fetchOtpFromEmail(null, {
    useEnvFallback: true,
    senderFilter,
  });
}

module.exports = {
  OTP_SOURCES,
  normalizeOtpSource,
  fetchOtpBySource,
};
