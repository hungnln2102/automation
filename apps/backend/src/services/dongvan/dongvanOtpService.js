const { db } = require("../../db");
const logger = require("../../utils/logger");
const {
  parseDongvanLine,
  resolveDongvanOAuthInput,
} = require("./parseDongvanLine");
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
const ACC_TABLE = tableName(RENEW_ADOBE_SCHEMA.ACCOUNT.TABLE, SCHEMA_RENEW_ADOBE);
const ACC_COLS = RENEW_ADOBE_SCHEMA.ACCOUNT.COLS;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function extractOtpCode(raw) {
  if (raw == null) return null;
  const str = String(raw).replace(/<[^>]+>/g, " ");
  const patterns = [
    /verification\s*code\s*(?:is|:)?\s*(\d{4,8})/i,
    /\bcode\s*(?:is|:)?\s*(\d{4,8})\b/i,
    /\b(\d{6})\b/,
    /\b(\d{4,8})\b/,
  ];
  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function isAdobeVerificationMessage(row) {
  const subject = String(row?.subject || "").toLowerCase();
  const body = String(row?.message || "").toLowerCase();
  return (
    subject.includes("verification") ||
    body.includes("verification code") ||
    body.includes("can't be accessed without this verification code")
  );
}

function parseMessageDateMs(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  const dongvanLocal = value.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );
  if (dongvanLocal) {
    const [, hour, minute, second = "0", day, month, year] = dongvanLocal;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second.padStart(2, "0")}+07:00`;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function messageMatchesSender(msg, senderFilter) {
  if (!senderFilter) return true;
  const needle = String(senderFilter).toLowerCase();
  const fromList = Array.isArray(msg?.from) ? msg.from : [];
  for (const item of fromList) {
    const addr = String(item?.address || "").toLowerCase();
    const name = String(item?.name || "").toLowerCase();
    if (addr.includes(needle) || name.includes(needle)) return true;
  }
  const subject = String(msg?.subject || "").toLowerCase();
  const body = String(msg?.message || "").toLowerCase();
  return subject.includes(needle) || body.includes(needle);
}

function pickOtpFromDongvanMessages(
  messages,
  {
    senderFilter = "adobe",
    minTimestampMs = null,
    requireVerification = false,
  } = {}
) {
  const rows = Array.isArray(messages) ? [...messages] : [];
  rows.sort((a, b) => {
    const ta = parseMessageDateMs(a?.date) ?? 0;
    const tb = parseMessageDateMs(b?.date) ?? 0;
    return tb - ta;
  });

  for (const row of rows) {
    if (!messageMatchesSender(row, senderFilter)) continue;
    if (requireVerification && !isAdobeVerificationMessage(row)) continue;
    const rowMs = parseMessageDateMs(row?.date);
    if (Number.isFinite(minTimestampMs)) {
      if (!Number.isFinite(rowMs) || rowMs < minTimestampMs) {
        continue;
      }
    }
    const code =
      extractOtpCode(row?.code) ||
      extractOtpCode(row?.subject) ||
      extractOtpCode(row?.message);
    if (code) return code;
  }
  return null;
}

async function fetchOtpFromDongvanCodeApi({
  mailboxEmail,
  refreshToken,
  clientId,
  type = "adobe",
  timeoutMs = 15000,
}) {
  const baseUrl = process.env.OTP_DONGVAN_BASE_URL || "https://tools.dongvanfb.net";
  const endpoint = process.env.OTP_DONGVAN_CODE_ENDPOINT || "/api/get_code_oauth2";
  const url = new URL(endpoint, baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: mailboxEmail || "",
        refresh_token: refreshToken,
        client_id: clientId,
        type,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || data.status === false) return null;

    return (
      extractOtpCode(data.code) ||
      extractOtpCode(data.message) ||
      extractOtpCode(data.content) ||
      null
    );
  } catch (error) {
    logger.warn("[dongvan-otp] get_code_oauth2 failed: %s", error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveDongvanOAuthCredentials(accountEmail, overrides = {}) {
  const refreshTokenRaw = String(
    overrides.refreshToken ?? overrides.oauthRefreshToken ?? ""
  ).trim();
  const clientIdRaw = String(overrides.clientId ?? overrides.oauthClientId ?? "").trim();
  const fromOverrides = resolveDongvanOAuthInput(refreshTokenRaw, clientIdRaw);
  if (fromOverrides?.refreshToken && fromOverrides?.clientId) {
    return {
      refreshToken: fromOverrides.refreshToken,
      clientId: fromOverrides.clientId,
      mailEmail:
        normalizeEmail(overrides.mailEmail ?? overrides.oauthMailEmail) ||
        fromOverrides.mailEmail ||
        null,
    };
  }

  const email = normalizeEmail(accountEmail);
  if (!email) return null;

  const listUser = await db(TRACK_TABLE)
    .select(
      TRACK_COLS.OTP_REFRESH_TOKEN,
      TRACK_COLS.OTP_CLIENT_ID,
      TRACK_COLS.OTP_MAIL_EMAIL
    )
    .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [TRACK_COLS.ACCOUNT, email])
    .first()
    .catch(() => null);

  const fromListUser = resolveDongvanOAuthInput(
    String(listUser?.[TRACK_COLS.OTP_REFRESH_TOKEN] ?? "").trim(),
    String(listUser?.[TRACK_COLS.OTP_CLIENT_ID] ?? "").trim()
  );
  if (fromListUser?.refreshToken && fromListUser?.clientId) {
    return {
      refreshToken: fromListUser.refreshToken,
      clientId: fromListUser.clientId,
      mailEmail:
        normalizeEmail(listUser?.[TRACK_COLS.OTP_MAIL_EMAIL]) ||
        fromListUser.mailEmail ||
        null,
    };
  }

  const admin = await db(ACC_TABLE)
    .select(
      ACC_COLS.OTP_REFRESH_TOKEN,
      ACC_COLS.OTP_CLIENT_ID,
      ACC_COLS.OTP_MAIL_EMAIL
    )
    .whereRaw("LOWER(TRIM(COALESCE(??, ''))) = ?", [ACC_COLS.EMAIL, email])
    .first()
    .catch(() => null);

  const fromAdmin = resolveDongvanOAuthInput(
    String(admin?.[ACC_COLS.OTP_REFRESH_TOKEN] ?? "").trim(),
    String(admin?.[ACC_COLS.OTP_CLIENT_ID] ?? "").trim()
  );
  if (fromAdmin?.refreshToken && fromAdmin?.clientId) {
    return {
      refreshToken: fromAdmin.refreshToken,
      clientId: fromAdmin.clientId,
      mailEmail:
        normalizeEmail(admin?.[ACC_COLS.OTP_MAIL_EMAIL]) ||
        fromAdmin.mailEmail ||
        null,
    };
  }

  const envClientId = String(process.env.OTP_DONGVAN_DEFAULT_CLIENT_ID || "").trim();
  if (fromListUser?.refreshToken && envClientId) {
    return {
      refreshToken: fromListUser.refreshToken,
      clientId: envClientId,
      mailEmail:
        normalizeEmail(listUser?.[TRACK_COLS.OTP_MAIL_EMAIL]) ||
        fromListUser.mailEmail ||
        null,
    };
  }
  if (fromAdmin?.refreshToken && envClientId) {
    return {
      refreshToken: fromAdmin.refreshToken,
      clientId: envClientId,
      mailEmail:
        normalizeEmail(admin?.[ACC_COLS.OTP_MAIL_EMAIL]) ||
        fromAdmin.mailEmail ||
        null,
    };
  }

  return null;
}

async function fetchOtpFromDongvanApi({
  accountEmail,
  refreshToken,
  clientId,
  mailEmail = null,
  senderFilter = "adobe",
  minTimestampMs = null,
  requireVerification = false,
  timeoutMs = 15000,
  listMail = "all",
}) {
  const creds = await resolveDongvanOAuthCredentials(accountEmail, {
    refreshToken,
    clientId,
    mailEmail,
    oauthMailEmail: mailEmail,
  });
  if (!creds?.refreshToken || !creds?.clientId) {
    logger.warn(
      "[dongvan-otp] Thiếu refresh_token/client_id cho email=%s",
      normalizeEmail(accountEmail)
    );
    return null;
  }

  const mailboxEmail = creds.mailEmail || normalizeEmail(accountEmail);

  const baseUrl = process.env.OTP_DONGVAN_BASE_URL || "https://tools.dongvanfb.net";
  const endpoint = process.env.OTP_DONGVAN_ENDPOINT || "/api/get_messages_oauth2";
  const url = new URL(endpoint, baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: mailboxEmail || "",
        refresh_token: creds.refreshToken,
        client_id: creds.clientId,
        list_mail: listMail,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("[dongvan-otp] API non-200 status=%s email=%s", response.status, accountEmail);
      return null;
    }

    const data = await response.json().catch(() => null);
    if (!data || data.status === false) {
      logger.warn("[dongvan-otp] API báo status=false email=%s", accountEmail);
      return null;
    }

    const fromMessages = pickOtpFromDongvanMessages(data.messages, {
      senderFilter,
      minTimestampMs,
      requireVerification,
    });
    if (fromMessages) return fromMessages;

    const codeType = String(process.env.OTP_DONGVAN_CODE_TYPE || "adobe").trim() || "adobe";
    return fetchOtpFromDongvanCodeApi({
      mailboxEmail,
      refreshToken: creds.refreshToken,
      clientId: creds.clientId,
      type: codeType,
      timeoutMs,
    });
  } catch (error) {
    logger.warn("[dongvan-otp] API read failed: %s", error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  pickOtpFromDongvanMessages,
  resolveDongvanOAuthCredentials,
  fetchOtpFromDongvanApi,
  fetchOtpFromDongvanCodeApi,
  parseDongvanLine,
  extractOtpCode,
  isAdobeVerificationMessage,
};
