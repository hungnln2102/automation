/**
 * Telegram Error / Warning Notifier
 * Gửi error + warn đến Telegram topic để theo dõi real-time.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN          — bot token
 *   TELEGRAM_CHAT_ID            — group chat id
 *   ERROR_TOPIC_ID              — topic id cho lỗi (default 6)
 *   SEND_ERROR_NOTIFICATION     — "false" để tắt (default "true")
 *
 * Nếu Telegram trả lỗi topic/thread (ví dụ "message thread not found"), gửi lại một lần
 * không kèm message_thread_id để tin vẫn vào nhóm.
 */

const https = require("https");
const os = require("os");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const ERROR_TOPIC_ID = Number.parseInt(process.env.ERROR_TOPIC_ID || "6", 10);
const ENABLED =
  String(process.env.SEND_ERROR_NOTIFICATION || "true").toLowerCase() !== "false";

const RATE_LIMIT_MS = 2000;
const MAX_QUEUE = 30;
let queue = [];
let sending = false;
let lastSentAt = 0;

const agent = new https.Agent({ keepAlive: true });

const postToTelegram = (payload) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        port: 443,
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        agent,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve(data));
      }
    );
    req.setTimeout(10_000, () => {
      req.destroy(new Error("Telegram request timed out"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });

/** Telegram trả HTTP 200 nhưng JSON có ok:false (sai topic, v.v.). */
function isTelegramThreadApiError(parsed) {
  if (!parsed || parsed.ok !== false) return false;
  const d = String(parsed.description || "").toLowerCase();
  return (
    d.includes("message_thread_id") ||
    d.includes("message thread not found") ||
    (d.includes("thread") && d.includes("not found")) ||
    (d.includes("topic") && d.includes("not found")) ||
    d.includes("not a forum") ||
    d.includes("forum is not enabled")
  );
}

async function sendMessageWithTopicFallback(payload) {
  const raw = await postToTelegram(payload);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (data && data.ok === true) return;
  if (!isTelegramThreadApiError(data) || payload.message_thread_id == null) return;
  const { message_thread_id: _t, ...rest } = payload;
  await postToTelegram(rest);
}

const LEVEL_META = {
  critical: { icon: "🔴", label: "CRITICAL" },
  error:    { icon: "🚨", label: "Error" },
  warn:     { icon: "⚠️", label: "Warning" },
};

const buildMessage = ({
  level = "error",
  message,
  source,
  url,
  method,
  stack,
  extra,
  messageMaxLength = 300,
  extraMaxLength = 200,
}) => {
  const meta = LEVEL_META[level] || LEVEL_META.error;
  const timestamp = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const hostname = os.hostname();
  const srcLabel = source === "frontend" ? "Frontend" : "Backend";

  const lines = [
    `${meta.icon} <b>${srcLabel} ${meta.label}</b>`,
    `⏰ ${timestamp}  🖥 ${hostname}`,
  ];

  if (url) lines.push(`📍 ${method ? `${method} ` : ""}${url}`);
  if (message) {
    const cap = Number.isFinite(Number(messageMaxLength)) && Number(messageMaxLength) > 0
      ? Number(messageMaxLength)
      : 300;
    lines.push(`💬 <code>${escapeHtml(truncate(message, cap))}</code>`);
  }
  if (stack) lines.push(`📋 <pre>${escapeHtml(truncate(stack, 400))}</pre>`);
  if (extra) {
    const capExtra = Number.isFinite(Number(extraMaxLength)) && Number(extraMaxLength) > 0
      ? Number(extraMaxLength)
      : 200;
    lines.push(`📎 ${escapeHtml(truncate(String(extra), capExtra))}`);
  }

  return lines.join("\n");
};

const escapeHtml = (str) =>
  String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const truncate = (str, max) => {
  const s = String(str || "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

const processQueue = async () => {
  if (sending || queue.length === 0) return;
  sending = true;

  while (queue.length > 0) {
    const now = Date.now();
    const wait = RATE_LIMIT_MS - (now - lastSentAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    const text = queue.shift();
    try {
      const payload = {
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      };
      if (Number.isFinite(ERROR_TOPIC_ID)) {
        payload.message_thread_id = ERROR_TOPIC_ID;
      }
      await sendMessageWithTopicFallback(payload);
      lastSentAt = Date.now();
    } catch (err) {
      console.error("[ErrorNotifier] Failed to send:", err?.message);
    }
  }

  sending = false;
};

/**
 * Gửi thông báo đến Telegram. Non-blocking, fire-and-forget.
 *
 * @param {Object} opts
 * @param {"critical"|"error"|"warn"} [opts.level="error"]
 * @param {string} opts.message
 * @param {string} [opts.source="backend"]
 * @param {string} [opts.url]
 * @param {string} [opts.method]
 * @param {string} [opts.stack]
 * @param {string} [opts.extra]
 * @param {number} [opts.messageMaxLength=300] — giới hạn độ dài message (vd. 3800 cho danh sách dài)
 * @param {number} [opts.extraMaxLength=200]
 */
const notify = (opts = {}) => {
  if (!ENABLED || !BOT_TOKEN || !CHAT_ID) return;
  const text = buildMessage(opts);
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(text);
  processQueue();
};

const notifyError = (opts = {}) => notify({ level: "error", ...opts });
const notifyWarn  = (opts = {}) => notify({ level: "warn", ...opts });
const notifyCritical = (opts = {}) => notify({ level: "critical", ...opts });

module.exports = { notify, notifyError, notifyWarn, notifyCritical };
