/**
 * Service đọc mail qua IMAP, lấy OTP từ hộp thư.
 * Độc lập với luồng login Adobe; có thể dùng từ bất kỳ module nào (Adobe check, hoặc API khác).
 *
 * Hỗ trợ:
 * - Đọc thông tin mailbox từ bảng mail_backup (theo mailBackupId).
 * - Fallback env: ADOBE_OTP_IMAP_* / MAILTEST / APPPASSWORD.
 * - Lọc theo người gửi (vd. chỉ mail Adobe) khi gọi fetchOtpFromAdobeEmail hoặc options.senderFilter.
 * - So sánh thời gian mail với thời gian hiện tại: chỉ lấy mail "mới" (ADOBE_OTP_MAIL_MAX_AGE_MINUTES, 0 = tắt).
 * - Nếu có nhiều mail: luôn chọn mail gần nhất (UID cao nhất) rồi trả về OTP của mail đó.
 */

const logger = require("../utils/logger");
const { db } = require("../db");
const { IDENTITY_SCHEMA, SCHEMA_MAIL_BACKUP, tableName } = require("../config/dbSchema");

const MAIL_BACKUP_TABLE =
  IDENTITY_SCHEMA?.MAIL_BACKUP
    ? tableName(IDENTITY_SCHEMA.MAIL_BACKUP.TABLE, SCHEMA_MAIL_BACKUP)
    : null;
const MB_COLS = IDENTITY_SCHEMA?.MAIL_BACKUP?.COLS || {};

/** Chuẩn hóa kết quả search: ImapFlow có thể trả về mảng trực tiếp hoặc object có .uidList */
function toUidList(list) {
  if (Array.isArray(list)) return list;
  if (list && Array.isArray(list.uidList)) return list.uidList;
  return [];
}

/** Map provider (gmail, outlook, ...) sang IMAP host */
function getImapHostFromProvider(provider) {
  if (!provider) return process.env.ADOBE_OTP_IMAP_HOST || "imap.gmail.com";
  const p = String(provider).toLowerCase();
  if (p.includes("gmail")) return "imap.gmail.com";
  if (p.includes("outlook") || p.includes("office365") || p.includes("hotmail")) return "imap-mail.outlook.com";
  if (p.includes("yahoo")) return "imap.mail.yahoo.com";
  return process.env.ADOBE_OTP_IMAP_HOST || "imap.gmail.com";
}

/**
 * Lấy thông tin mailbox từ bảng mail_backup theo id (chỉ dòng is_active).
 * email = dùng cho IMAP login (thay MAILTEST); alias_prefix = dùng để filter thư lấy OTP.
 * @param {number} mailBackupId
 * @returns {Promise<{ email: string, app_password: string, provider: string, alias_prefix?: string }|null>}
 */
async function getMailBackupById(mailBackupId) {
  if (!MAIL_BACKUP_TABLE || !mailBackupId) return null;
  try {
    const row = await db(MAIL_BACKUP_TABLE)
      .where(MB_COLS.ID, mailBackupId)
      .where(MB_COLS.IS_ACTIVE, true)
      .first();
    if (!row || !row[MB_COLS.EMAIL] || !row[MB_COLS.APP_PASSWORD]) return null;
    const aliasPrefix = MB_COLS.ALIAS_PREFIX && row[MB_COLS.ALIAS_PREFIX] != null ? String(row[MB_COLS.ALIAS_PREFIX]).trim() : "";
    return {
      email: row[MB_COLS.EMAIL],
      app_password: row[MB_COLS.APP_PASSWORD],
      provider: row[MB_COLS.PROVIDER] || "gmail",
      ...(aliasPrefix ? { alias_prefix: aliasPrefix } : {}),
    };
  } catch (err) {
    logger.warn("[mailOtpService] getMailBackupById lỗi: %s", err.message);
    return null;
  }
}

/**
 * Trích mã OTP 6 hoặc 8 chữ số từ chuỗi (email body).
 * @param {string} text
 * @returns {string|null}
 */
/** Gỡ thẻ HTML để lấy chữ (tránh OTP nằm trong <span>123</span><span>456</span>) */
function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOtpFromText(text) {
  if (!text || typeof text !== "string") return null;
  const raw = stripHtml(text);
  const t = raw.replace(/\s+/g, " ");
  // Ưu tiên: 6 hoặc 8 chữ số sau từ khóa (code, Bestätigungscode, mã, ...)
  const re = /\b(\d{6})\b|(?:code|mã|verification|bestätigungscode|lautet|confirmation|bestätigung)\s*[:\s]*(\d{6})\b|\b(\d{8})\b/gi;
  let m = re.exec(t);
  if (m) {
    const code = String(m[1] || m[2] || m[3] || "").trim();
    if (code.length >= 6) return code.slice(0, 8);
  }
  // Fallback: 6 chữ số có thể cách nhau bằng space/dash (123 456, 123-456)
  const withSep = /(\d{3}\s*[-.\s]\s*\d{3})/g;
  while ((m = withSep.exec(t)) !== null) {
    const code = (m[1] || "").replace(/\D/g, "");
    if (code.length === 6) return code;
  }
  // Fallback: bất kỳ chuỗi 6 hoặc 8 chữ số (thường là OTP)
  const fallback = /(\d{6,8})/g;
  let lastMatch = null;
  while ((m = fallback.exec(t)) !== null) lastMatch = m[1];
  if (lastMatch) return lastMatch.length >= 6 ? lastMatch.slice(0, 8) : null;
  return null;
}

/** Predicate: email có được coi là từ Adobe không (From + body). From có thể là "Adobe 5", "Cyrus Devil", hoặc địa chỉ @adobe.com */
function isAdobeEmail(fromHeader, bodyText) {
  const from = (fromHeader || "").toLowerCase();
  const body = (bodyText || "").toLowerCase();
  return (
    /\badobe\b|@adobe\.com|adobe\.com/.test(from) ||
    /@adobe\.com|noreply@.*adobe|adobe.*verification|message@adobe|\badobe\b/.test(body)
  );
}

/** Predicate: nội dung có phải mail xác minh/OTP không (đa ngôn ngữ: EN, VI, DE, ...) */
function isVerificationEmail(bodyText) {
  const t = (bodyText || "").toLowerCase();
  return (
    /verification|verify|mã xác minh|your code|one-time|confirmation code|bestätigungscode|confirmationcode/i.test(t) ||
    /codigo de verificaci[oó]n|code de v[eé]rification|確認コード|验证码|کد تأیید/i.test(t) ||
    /lautet\s*:?\s*\d{6}|dein bestätigungscode|your verification code/i.test(t)
  );
}

/**
 * Lấy mã OTP từ hộp thư qua IMAP.
 * @param {number|null} [mailBackupId] - ID bản ghi trong mail_backup (ưu tiên).
 * @param {Object} [options]
 * @param {boolean} [options.useEnvFallback=true] - Nếu không có mailBackupId, dùng env ADOBE_OTP_IMAP_* / MAILTEST / APPPASSWORD.
 * @param {string|null} [options.senderFilter] - 'adobe' = chỉ lấy mail từ Adobe; null = lấy bất kỳ mail có mã OTP.
 * @param {boolean} [options.debugToConsole=false] - true = in thêm [OTP DEBUG] ra console để dễ xem khi test.
 * @returns {Promise<string|null>} Mã OTP hoặc null.
 */
async function fetchOtpFromEmail(mailBackupId = null, options = {}) {
  const { useEnvFallback = true, senderFilter = null, debugToConsole = false } = options;
  const log = (msg, ...args) => {
    logger.info(msg, ...args);
    if (debugToConsole && String(msg).includes("[OTP DEBUG]")) {
      try {
        console.log(args.length ? require("util").format(msg, ...args) : msg);
      } catch (_) {
        console.log(msg, ...args);
      }
    }
  };
  let host, user, pass, backup = null;
  if (mailBackupId) {
    backup = await getMailBackupById(mailBackupId);
    if (!backup) return null;
    host = getImapHostFromProvider(backup.provider);
    user = backup.email;
    pass = backup.app_password;
  } else if (useEnvFallback) {
    user = process.env.ADOBE_OTP_IMAP_USER || process.env.MAILTEST;
    pass = process.env.ADOBE_OTP_IMAP_PASSWORD || process.env.APPPASSWORD || process.env["2FA"];
    host = process.env.ADOBE_OTP_IMAP_HOST || "imap.gmail.com";
  }
  if (!host || !user || !pass) {
    log("[mailOtpService] [OTP DEBUG] Không đủ cấu hình IMAP (host/user/pass) — bỏ qua.");
    if (debugToConsole) console.log("[mailOtpService] [OTP] Không đủ cấu hình IMAP — kiểm tra mail_backup_id hoặc ADOBE_OTP_IMAP_* / MAILTEST / APPPASSWORD.");
    return null;
  }
  if (debugToConsole) console.log("[mailOtpService] [OTP] Bắt đầu kết nối IMAP và tìm mail OTP...");
  const onlyAdobe = senderFilter === "adobe";
  const mask = (s) => (s && s.length > 4 ? s.slice(0, 2) + "***" + s.slice(-2) : "***");
  const aliasPrefixVal = backup?.alias_prefix ?? "(env)";
  log("[mailOtpService] [OTP DEBUG] Lấy OTP: host=%s, user=%s, onlyAdobe=%s, alias_prefix=%s", host, mask(user), onlyAdobe, aliasPrefixVal);
  try {
    const { ImapFlow } = require("imapflow");
    const client = new ImapFlow({
      host,
      port: parseInt(process.env.ADOBE_OTP_IMAP_PORT || "993", 10),
      secure: process.env.ADOBE_OTP_IMAP_TLS !== "false",
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const minutesBack = parseInt(process.env.ADOBE_OTP_MAIL_MINUTES || "60", 10) || 60;
      const maxMails = parseInt(process.env.ADOBE_OTP_MAIL_MAX || "50", 10) || 50;
      const maxAgeMinutes = parseInt(process.env.ADOBE_OTP_MAIL_MAX_AGE_MINUTES || "0", 10) || 0;
      if (maxAgeMinutes > 0) log("[mailOtpService] [OTP DEBUG] Chỉ lấy OTP từ mail gửi trong %s phút gần đây (so với thời gian hiện tại).", maxAgeMinutes);
      let uidList = [];
      let list = await client.search({ since: new Date(Date.now() - minutesBack * 60 * 1000) }, { uid: true });
      uidList = toUidList(list);
      if (uidList.length === 0) {
        list = await client.search({ since: new Date(Date.now() - 24 * 60 * 60 * 1000) }, { uid: true });
        uidList = toUidList(list);
      }
      if (uidList.length === 0) {
        list = await client.search({ all: true }, { uid: true });
        uidList = toUidList(list);
      }
      const aliasPrefix = (backup && backup.alias_prefix) ? String(backup.alias_prefix).trim().toLowerCase() : "";
      const mailboxUser = (backup && backup.email) ? String(backup.email).trim().toLowerCase() : "";
      const aliasSameAsMailbox = aliasPrefix && mailboxUser && (aliasPrefix === mailboxUser || aliasPrefix.includes(mailboxUser) || mailboxUser.includes(aliasPrefix));
      if (aliasSameAsMailbox) log("[mailOtpService] [OTP DEBUG] alias_prefix trùng mailbox — chấp nhận mọi mail trong hộp thư (ưu tiên mail mới nhất).");
      let lastCode = null;
      const { simpleParser } = require("mailparser");
      const processOne = async (raw, uidForLog = null) => {
        try {
          const p = await simpleParser(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
          const htmlStripped = stripHtml(p.html || "");
          const bodyText = [(p.text || "").trim(), htmlStripped].filter(Boolean).join(" ");
          const fromHeader = [p.from?.text, p.from?.value?.map((a) => a.address).join(" ")].filter(Boolean).join(" ");
          const toHeader = [p.to?.text, p.to?.value?.map((a) => a.address).join(" ")].filter(Boolean).join(" ");
          const subject = (p.subject || "").slice(0, 80);
          const mailDate = p.date ? new Date(p.date) : null;
          const now = Date.now();
          const minutesAgo = mailDate ? Math.max(0, Math.floor((now - mailDate.getTime()) / 60000)) : null;
          const timeStr = mailDate ? `${String(mailDate.getHours()).padStart(2, "0")}:${String(mailDate.getMinutes()).padStart(2, "0")} (${minutesAgo} phút trước)` : "(không có ngày)";
          if (uidForLog != null) log("[mailOtpService] [OTP DEBUG] Mail UID %s — From: %s | Subject: %s | Thời gian: %s", uidForLog, (fromHeader || "").slice(0, 50), subject.slice(0, 50), timeStr);
          if (maxAgeMinutes > 0 && mailDate && (now - mailDate.getTime()) > maxAgeMinutes * 60 * 1000) {
            if (uidForLog != null) log("[mailOtpService] [OTP DEBUG] Mail UID %s: bỏ qua — mail cũ (gửi %s phút trước, chỉ lấy mail trong %s phút gần đây).", uidForLog, minutesAgo, maxAgeMinutes);
            return null;
          }
          const fullText = (subject + " " + fromHeader + " " + toHeader + " " + bodyText).replace(/\s+/g, " ");
          const fullLower = fullText.toLowerCase();
          const skipAliasCheck = !!backup;
          if (!skipAliasCheck && aliasPrefix && !aliasSameAsMailbox && !fullLower.includes(aliasPrefix)) {
            if (uidForLog != null) log("[mailOtpService] [OTP DEBUG] Mail UID %s: bỏ qua — không chứa alias_prefix.", uidForLog);
            return null;
          }
          if (onlyAdobe && !isAdobeEmail(fromHeader, fullText)) {
            if (uidForLog != null) log("[mailOtpService] [OTP DEBUG] Mail UID %s: bỏ qua — không phải From Adobe.", uidForLog);
            return null;
          }
          if (!isVerificationEmail(fullText)) {
            if (uidForLog != null) log("[mailOtpService] [OTP DEBUG] Mail UID %s: bỏ qua — không phải mail xác minh (subject: %s).", uidForLog, subject);
            return null;
          }
          const code = extractOtpFromText(bodyText || fullText);
          if (uidForLog != null) log("[mailOtpService] [OTP DEBUG] Mail UID %s: Đúng mail OTP — trích OTP: %s", uidForLog, code || "(không tìm thấy số trong nội dung)");
          return code;
        } catch (e) {
          if (uidForLog != null) log("[mailOtpService] [OTP DEBUG] Mail UID %s: lỗi parse — %s", uidForLog, e.message);
          return null;
        }
      };
      if (uidList.length > 0) {
        const nowStr = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        log("[mailOtpService] [OTP DEBUG] Thời gian hiện tại: %s — IMAP trả về %s mail, xử lý từ mới nhất (UID cao nhất) xuống.", nowStr, uidList.length);
        const uids = uidList.slice(-Math.min(maxMails, uidList.length));
        let processed = 0;
        for (let i = uids.length - 1; i >= 0; i--) {
          const uid = uids[i];
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!msg?.source) {
            log("[mailOtpService] [OTP DEBUG] Mail UID %s: bỏ qua — không có nội dung (source rỗng).", uid);
            continue;
          }
          processed++;
          lastCode = await processOne(msg.source, uid);
          if (lastCode) {
            log("[mailOtpService] [OTP DEBUG] Đã chọn mail UID %s (mail gần nhất đúng điều kiện), trả về OTP=[%s]", uid, lastCode);
            break;
          }
        }
        if (!lastCode && processed > 0) log("[mailOtpService] [OTP DEBUG] Đã quét %s mail, không có mail nào trả về OTP. Xem các dòng trên để biết từng mail bị bỏ qua vì sao.", processed);
      } else {
        const exists = client.mailbox?.exists ?? 0;
        log("[mailOtpService] [OTP DEBUG] Fallback fetch theo sequence, mailbox.exists=%s", exists);
        if (exists > 0) {
          const start = Math.max(1, exists - maxMails + 1);
          const range = `${start}:${exists}`;
          const collected = [];
          for await (const msg of client.fetch(range, { source: true })) {
            if (msg?.source) collected.push(msg.source);
          }
          for (let j = collected.length - 1; j >= 0; j--) {
            lastCode = await processOne(collected[j], `seq_${j}`);
            if (lastCode) {
              log("[mailOtpService] [OTP DEBUG] Đã chọn mail index %s, OTP=[%s]", j, lastCode);
              break;
            }
          }
        }
      }
      const resultMsg = lastCode != null ? `OTP=[${lastCode}]` : "null (không tìm thấy)";
      log("[mailOtpService] [OTP DEBUG] fetchOtpFromEmail kết quả: %s", resultMsg);
      if (debugToConsole) console.log("[mailOtpService] [OTP] Kết quả trả về:", lastCode != null ? "có mã, length=" + String(lastCode).length : "null");
      return lastCode;
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    logger.warn("[mailOtpService] fetchOtpFromEmail lỗi: %s", err.message);
    return null;
  }
}

/**
 * Lấy mã OTP từ mail Adobe (chỉ mail từ Adobe, dùng cho flow login Adobe).
 * @param {number|null} [mailBackupId]
 * @returns {Promise<string|null>}
 */
async function fetchOtpFromAdobeEmail(mailBackupId = null) {
  return fetchOtpFromEmail(mailBackupId, { useEnvFallback: true, senderFilter: "adobe" });
}

/**
 * Kiểm tra có cấu hình để lấy OTP qua mail không (mail_backup hoặc env).
 * @param {number|null} [mailBackupId]
 * @returns {Promise<boolean>}
 */
async function hasOtpConfig(mailBackupId = null) {
  if (mailBackupId) {
    const backup = await getMailBackupById(mailBackupId);
    if (backup) return true;
  }
  const user = process.env.ADOBE_OTP_IMAP_USER || process.env.MAILTEST;
  const pass = process.env.ADOBE_OTP_IMAP_PASSWORD || process.env.APPPASSWORD || process.env["2FA"];
  const host = process.env.ADOBE_OTP_IMAP_HOST || (user ? "imap.gmail.com" : null);
  return !!(host && user && pass);
}

/**
 * Đếm số thư trong INBOX (cùng cách với test-imap-login: dùng status("INBOX", { messages: true })).
 * Dùng dữ liệu từ bảng mail_backup.
 * @param {number} mailBackupId
 * @returns {Promise<number|null>} Số thư hoặc null nếu lỗi.
 */
async function getInboxCount(mailBackupId) {
  const backup = await getMailBackupById(mailBackupId);
  if (!backup) return null;
  const host = getImapHostFromProvider(backup.provider);
  const { user, app_password: pass } = backup;
  if (!host || !user || !pass) return null;
  try {
    const { ImapFlow } = require("imapflow");
    const client = new ImapFlow({
      host,
      port: parseInt(process.env.ADOBE_OTP_IMAP_PORT || "993", 10),
      secure: process.env.ADOBE_OTP_IMAP_TLS !== "false",
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const info = await client.status("INBOX", { messages: true });
      return info.messages ?? null;
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    logger.warn("[mailOtpService] getInboxCount lỗi: %s", err.message);
    return null;
  }
}

/**
 * Debug kết nối IMAP: trả về kết quả search, mailbox.exists để tìm nguyên nhân không lấy được mail.
 * @param {number} mailBackupId
 * @returns {Promise<{ searchAllType: string, searchAllLength: number, uidListLength: number, mailboxExists: number, error?: string }>}
 */
async function getConnectionDebug(mailBackupId) {
  const backup = await getMailBackupById(mailBackupId);
  if (!backup) return { searchAllType: "", searchAllLength: 0, uidListLength: 0, mailboxExists: 0, error: "getMailBackupById null" };
  const host = getImapHostFromProvider(backup.provider);
  const { user, app_password: pass } = backup;
  if (!host || !user || !pass) return { searchAllType: "", searchAllLength: 0, uidListLength: 0, mailboxExists: 0, error: "missing credentials" };
  try {
    const { ImapFlow } = require("imapflow");
    const client = new ImapFlow({
      host,
      port: parseInt(process.env.ADOBE_OTP_IMAP_PORT || "993", 10),
      secure: process.env.ADOBE_OTP_IMAP_TLS !== "false",
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const list = await client.search({ all: true }, { uid: true });
      const uidList = toUidList(list);
      const mailboxExists = client.mailbox?.exists ?? -1;
      return {
        searchAllType: Array.isArray(list) ? "array" : (list && typeof list.uidList !== "undefined" ? "object.uidList" : typeof list),
        searchAllLength: Array.isArray(list) ? list.length : (list?.uidList?.length ?? 0),
        uidListLength: uidList.length,
        mailboxExists,
      };
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    return { searchAllType: "", searchAllLength: 0, uidListLength: 0, mailboxExists: 0, error: err.message };
  }
}

/**
 * Liệt kê metadata (from, subject, date) của N mail gần nhất — để debug xem IMAP trả về gì.
 * @param {number} mailBackupId
 * @param {Object} [options] { minutesBack: number, limit: number }
 * @returns {Promise<Array<{ from: string, subject: string, date: Date }>>}
 */
async function listRecentEmails(mailBackupId, options = {}) {
  const minutesBack = options.minutesBack != null ? options.minutesBack : 60;
  const limit = options.limit != null ? options.limit : 20;
  const backup = await getMailBackupById(mailBackupId);
  if (!backup) return [];
  const host = getImapHostFromProvider(backup.provider);
  const { user, app_password: pass } = backup;
  if (!host || !user || !pass) return [];
  try {
    const { ImapFlow } = require("imapflow");
    const client = new ImapFlow({
      host,
      port: parseInt(process.env.ADOBE_OTP_IMAP_PORT || "993", 10),
      secure: process.env.ADOBE_OTP_IMAP_TLS !== "false",
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      let uidList = [];
      const since = new Date(Date.now() - minutesBack * 60 * 1000);
      let list = await client.search({ since }, { uid: true });
      uidList = toUidList(list);
      if (uidList.length === 0) {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        list = await client.search({ since: since24h }, { uid: true });
        uidList = toUidList(list);
      }
      if (uidList.length === 0) {
        list = await client.search({ all: true }, { uid: true });
        uidList = toUidList(list);
      }
      const result = [];
      const { simpleParser } = require("mailparser");
      const pushParsed = (parsed) => {
        const fromHeader = [parsed.from?.text, parsed.from?.value?.map((a) => a.address).join(" ")].filter(Boolean).join(" ");
        result.push({ from: fromHeader, subject: (parsed.subject || "").slice(0, 80), date: parsed.date || new Date() });
      };
      if (uidList.length > 0) {
        const uids = uidList.slice(-Math.min(limit, 50));
        for (let i = uids.length - 1; i >= 0 && result.length < limit; i--) {
          const msg = await client.fetchOne(uids[i], { source: true }, { uid: true });
          if (!msg?.source) continue;
          try {
            const parsed = await simpleParser(Buffer.isBuffer(msg.source) ? msg.source : Buffer.from(msg.source));
            pushParsed(parsed);
          } catch (_) {}
        }
      } else {
        const exists = client.mailbox?.exists ?? 0;
        if (exists > 0) {
          const start = Math.max(1, exists - Math.min(limit, 50) + 1);
          const range = `${start}:${exists}`;
          const collected = [];
          for await (const msg of client.fetch(range, { source: true })) {
            if (msg?.source) collected.push(msg.source);
          }
          for (let j = collected.length - 1; j >= 0 && result.length < limit; j--) {
            try {
              const parsed = await simpleParser(Buffer.isBuffer(collected[j]) ? collected[j] : Buffer.from(collected[j]));
              pushParsed(parsed);
            } catch (_) {}
          }
        }
      }
      return result;
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    logger.warn("[mailOtpService] listRecentEmails lỗi: %s", err.message);
    return [];
  }
}

/**
 * Lấy toàn bộ nội dung mail Adobe gần nhất (HTML + text) — dùng để debug.
 * Chỉ lấy mail từ message@adobe.com / @adobe.com hoặc From chứa "Adobe".
 * @param {number} mailBackupId - ID bản ghi trong mail_backup (bắt buộc).
 * @param {Object} [options]
 * @param {number} [options.minutesBack=60]
 * @returns {Promise<{ html: string, text: string, subject: string, from: string, date: Date }|null>}
 */
async function fetchLastAdobeEmailRaw(mailBackupId, options = {}) {
  const minutesBack = options.minutesBack != null ? options.minutesBack : 60;
  const backup = await getMailBackupById(mailBackupId);
  if (!backup) return null;
  const host = getImapHostFromProvider(backup.provider);
  const { user, app_password: pass } = backup;
  if (!host || !user || !pass) return null;
  try {
    const { ImapFlow } = require("imapflow");
    const client = new ImapFlow({
      host,
      port: parseInt(process.env.ADOBE_OTP_IMAP_PORT || "993", 10),
      secure: process.env.ADOBE_OTP_IMAP_TLS !== "false",
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      let uidList = [];
      let list = await client.search({ since: new Date(Date.now() - minutesBack * 60 * 1000) }, { uid: true });
      uidList = toUidList(list);
      if (uidList.length === 0) {
        list = await client.search({ since: new Date(Date.now() - 24 * 60 * 60 * 1000) }, { uid: true });
        uidList = toUidList(list);
      }
      if (uidList.length === 0) {
        list = await client.search({ all: true }, { uid: true });
        uidList = toUidList(list);
      }
      const { simpleParser } = require("mailparser");
      const tryParseAdobe = async (raw) => {
        const parsed = await simpleParser(Buffer.isBuffer(raw) ? raw : Buffer.from(raw));
        const fromHeader = [parsed.from?.text, parsed.from?.value?.map((a) => a.address).join(" ")].filter(Boolean).join(" ");
        const fromLower = (fromHeader || "").toLowerCase();
        if (!/message@adobe\.com|@adobe\.com/.test(fromLower) && !fromLower.includes("adobe")) return null;
        return { html: parsed.html || "", text: parsed.text || "", subject: parsed.subject || "", from: fromHeader, date: parsed.date || new Date() };
      };
      if (uidList.length > 0) {
        const uids = uidList.slice(-50);
        for (let i = uids.length - 1; i >= 0; i--) {
          const msg = await client.fetchOne(uids[i], { source: true }, { uid: true });
          if (!msg?.source) continue;
          try {
            const out = await tryParseAdobe(msg.source);
            if (out) return out;
          } catch (_) {}
        }
      } else {
        const exists = client.mailbox?.exists ?? 0;
        if (exists > 0) {
          const start = Math.max(1, exists - 49);
          const range = `${start}:${exists}`;
          const collected = [];
          for await (const msg of client.fetch(range, { source: true })) {
            if (msg?.source) collected.push(msg.source);
          }
          for (let j = collected.length - 1; j >= 0; j--) {
            try {
              const out = await tryParseAdobe(collected[j]);
              if (out) return out;
            } catch (_) {}
          }
        }
      }
      return null;
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    logger.warn("[mailOtpService] fetchLastAdobeEmailRaw lỗi: %s", err.message);
    return null;
  }
}

/**
 * Đăng nhập IMAP bằng env (MAILTEST, APPPASSWORD), lấy thư gần nhất; nếu có mail_backup_id thì lấy email từ bảng để lọc.
 * Trả về: count (số thư INBOX), emails (danh sách đã parse, có thể lọc theo mail_backup email), newest (thư mới nhất).
 * @param {Object} [options]
 * @param {number|null} [options.mailBackupIdForFilter] - Nếu set, lấy email từ mail_backup để chỉ giữ thư to/from trùng email đó.
 * @param {number} [options.limit=20]
 * @returns {Promise<{ count: number, emails: Array<{ from: string, to: string, subject: string, date: Date, html?: string, text?: string }>, newest: object|null }>}
 */
async function fetchRecentWithEnvLogin(options = {}) {
  const mailBackupId = options.mailBackupIdForFilter ?? null;
  const limit = options.limit ?? 20;
  const user = process.env.ADOBE_OTP_IMAP_USER || process.env.MAILTEST;
  const pass = process.env.ADOBE_OTP_IMAP_PASSWORD || process.env.APPPASSWORD || process.env["2FA"];
  const host = process.env.ADOBE_OTP_IMAP_HOST || "imap.gmail.com";
  if (!user || !pass) {
    return { count: 0, emails: [], newest: null };
  }
  let filterBy = null;
  if (mailBackupId) {
    const backup = await getMailBackupById(mailBackupId);
    if (backup) {
      const ap = backup.alias_prefix ? String(backup.alias_prefix).trim() : "";
      filterBy = ap ? ap.toLowerCase() : (backup.email ? backup.email.toLowerCase().trim() : null);
    }
  }
  try {
    const { ImapFlow } = require("imapflow");
    const client = new ImapFlow({
      host,
      port: parseInt(process.env.ADOBE_OTP_IMAP_PORT || "993", 10),
      secure: process.env.ADOBE_OTP_IMAP_TLS !== "false",
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const info = await client.status("INBOX", { messages: true });
      const count = info.messages ?? 0;
      const result = [];
      if (count > 0) {
        const exists = client.mailbox?.exists ?? count;
        const start = Math.max(1, exists - limit + 1);
        const range = `${start}:${exists}`;
        const { simpleParser } = require("mailparser");
        for await (const msg of client.fetch(range, { source: true })) {
          if (!msg?.source) continue;
          try {
            const parsed = await simpleParser(Buffer.isBuffer(msg.source) ? msg.source : Buffer.from(msg.source));
            const from = [parsed.from?.text, parsed.from?.value?.map((a) => a.address).join(" ")].filter(Boolean).join(" ");
            const to = [parsed.to?.text, parsed.to?.value?.map((a) => a.address).join(" ")].filter(Boolean).join(" ");
            const subject = parsed.subject || "";
            const date = parsed.date || new Date();
            if (filterBy) {
              const fromTo = (from + " " + to).toLowerCase();
              if (!fromTo.includes(filterBy)) continue;
            }
            result.push({
              from,
              to,
              subject: subject.slice(0, 120),
              date,
              html: parsed.html || "",
              text: parsed.text || "",
            });
          } catch (_) {}
        }
        result.reverse();
      }
      const newest = result.length > 0 ? result[0] : null;
      return { count, emails: result, newest };
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    logger.warn("[mailOtpService] fetchRecentWithEnvLogin lỗi: %s", err.message);
    return { count: 0, emails: [], newest: null };
  }
}

module.exports = {
  getImapHostFromProvider,
  getMailBackupById,
  extractOtpFromText,
  fetchOtpFromEmail,
  fetchOtpFromAdobeEmail,
  hasOtpConfig,
  getInboxCount,
  getConnectionDebug,
  listRecentEmails,
  fetchLastAdobeEmailRaw,
  fetchRecentWithEnvLogin,
};
