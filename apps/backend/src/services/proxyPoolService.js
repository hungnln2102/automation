const { db } = require("../db");
const { chromium } = require("playwright");
const {
  IDENTITY_SCHEMA,
  SCHEMA_RENEW_ADOBE,
  tableName,
} = require("../config/dbSchema");
const { parseProxyUrl, getPlaywrightProxyOptions, getChromiumLaunchArgs } = require("./renew-adobe/adobe-renew-v2/shared/proxyConfig");

const PROXY_TABLE = IDENTITY_SCHEMA?.ADMIN_PROXY
  ? tableName(IDENTITY_SCHEMA.ADMIN_PROXY.TABLE, SCHEMA_RENEW_ADOBE)
  : null;
const PX = IDENTITY_SCHEMA?.ADMIN_PROXY?.COLS || {};

function maskProxyUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    const user = u.username ? `${decodeURIComponent(u.username)}:***@` : "";
    return `${u.protocol}//${user}${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch (_) {
    const parts = s.split(":");
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}:***`;
    return s.slice(0, 24) + (s.length > 24 ? "ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" : "");
  }
}

function normalizeProxyInput(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/\uFF20/g, "@")
    .replace(/\r?\n/g, "")
    .replace(/\s+/g, "");
}

function buildCanonicalProxyUrl({ host, port, username, password }) {
  const hostStr = String(host ?? "").trim();
  const portNum = Number(String(port ?? "").trim());
  if (!hostStr || !Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
    return null;
  }

  const user = username != null ? String(username).trim() : "";
  const pass = password != null ? String(password) : "";
  const auth =
    user && pass !== undefined
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
      : user
        ? `${encodeURIComponent(user)}@`
        : "";
  const url = `http://${auth}${hostStr}:${portNum}`;
  return parseProxyUrl(url)?.server ? url : null;
}

/**
 * HÃƒÂ¡Ã‚Â»Ã¢â‚¬â€ trÃƒÂ¡Ã‚Â»Ã‚Â£:
 * - user:pass@host:port  (vd: ellendietric530:mdkwmdg0mdu=@180.93.2.169:3129)
 * - http://user:pass@host:port
 * - host:port:user:pass  (vd: 180.93.2.169:3129:ellendietric530:mdkwmdg0mdu=)
 */
function parseProxyLine(raw) {
  const line = normalizeProxyInput(raw);
  if (!line) return null;

  if (/^https?:\/\//i.test(line)) {
    const parsed = parseProxyUrl(line);
    return parsed?.server ? line : null;
  }

  const atIndex = line.lastIndexOf("@");
  if (atIndex > 0) {
    const authPart = line.slice(0, atIndex);
    const hostPart = line.slice(atIndex + 1);
    const userSplit = authPart.indexOf(":");
    const hostMatch = hostPart.match(/^([^:\/]+):(\d+)$/);
    if (userSplit > 0 && hostMatch) {
      const username = authPart.slice(0, userSplit);
      const password = authPart.slice(userSplit + 1);
      const [, host, port] = hostMatch;
      const url = buildCanonicalProxyUrl({ host, port, username, password });
      if (url) return url;
    }
  }

  const parts = line.split(":").map((p) => p.trim());
  if (parts.length >= 4) {
    const [host, port, username, ...passwordParts] = parts;
    const password = passwordParts.join(":");
    const url = buildCanonicalProxyUrl({ host, port, username, password });
    if (url) return url;
  }

  if (parts.length === 2) {
    return buildCanonicalProxyUrl({ host: parts[0], port: parts[1] });
  }

  return null;
}

function toPlaywrightProxyOptions(proxyUrl) {
  const parsed = parseProxyUrl(proxyUrl);
  if (!parsed) return undefined;
  const opt = { server: parsed.server };
  if (parsed.username) opt.username = parsed.username;
  if (parsed.password) opt.password = parsed.password;
  return opt;
}

function toPublicRow(row) {
  if (!row) return null;
  return {
    id: row[PX.ID],
    label: row[PX.LABEL] ?? null,
    proxy_url_masked: maskProxyUrl(row[PX.PROXY_URL]),
    note: row[PX.NOTE] ?? null,
    is_active: row[PX.IS_ACTIVE] !== false,
    is_default: row[PX.IS_DEFAULT] === true,
    is_alive: row[PX.IS_ALIVE] !== false,
    last_checked_at: row[PX.LAST_CHECKED_AT] ?? null,
    last_error: row[PX.LAST_ERROR] ?? null,
    created_at: row[PX.CREATED_AT] ?? null,
    updated_at: row[PX.UPDATED_AT] ?? null,
  };
}

async function clearOtherDefaults(exceptId = null, trx = db) {
  if (!PROXY_TABLE || !PX.IS_DEFAULT) return;
  let q = trx(PROXY_TABLE).where(PX.IS_DEFAULT, true);
  if (exceptId != null) q = q.whereNot(PX.ID, exceptId);
  await q.update({ [PX.IS_DEFAULT]: false, [PX.UPDATED_AT]: trx.fn.now() });
}

async function listAdminProxies() {
  if (!PROXY_TABLE) return [];
  const rows = await db(PROXY_TABLE).orderBy(PX.ID, "asc");
  return rows.map(toPublicRow);
}

async function getAdminProxyById(id) {
  if (!PROXY_TABLE || !id) return null;
  return db(PROXY_TABLE).where(PX.ID, id).first();
}

async function getPreferredAliveProxyRow() {
  if (!PROXY_TABLE) return null;
  return db(PROXY_TABLE)
    .where(PX.IS_ACTIVE, true)
    .where(PX.IS_ALIVE, true)
    .orderBy(PX.IS_DEFAULT, "desc")
    .orderBy(PX.ID, "asc")
    .first();
}

async function getDefaultProxyRow() {
  if (!PROXY_TABLE) return null;
  return db(PROXY_TABLE)
    .where(PX.IS_ACTIVE, true)
    .where(PX.IS_DEFAULT, true)
    .orderBy(PX.ID, "asc")
    .first();
}

function rowToPlaywrightOptions(row) {
  if (!row || row[PX.IS_ACTIVE] === false || row[PX.IS_ALIVE] === false) {
    return null;
  }
  return toPlaywrightProxyOptions(row[PX.PROXY_URL]);
}

/**
 * Ưu tiên: proxy sống trong pool → proxy mặc định DB → env ADOBE_PROXY.
 * Không ghim proxy theo từng account khi login/check admin.
 */
async function resolvePlaywrightProxyForAdminLogin(_account) {
  const envFallback = getPlaywrightProxyOptions();
  if (!PROXY_TABLE) {
    return {
      playwright: envFallback,
      proxyId: null,
      source: envFallback ? "env" : "none",
      label: envFallback?.server ?? null,
    };
  }

  const aliveRow = await getPreferredAliveProxyRow();
  const alivePlaywright = rowToPlaywrightOptions(aliveRow);
  if (alivePlaywright && aliveRow?.[PX.ID]) {
    return {
      playwright: alivePlaywright,
      proxyId: aliveRow[PX.ID],
      source: aliveRow[PX.IS_DEFAULT] === true ? "default" : "pool-alive",
      label: aliveRow[PX.LABEL] || maskProxyUrl(aliveRow[PX.PROXY_URL]),
    };
  }

  const defaultRow = await getDefaultProxyRow();
  const defaultPlaywright = defaultRow
    ? toPlaywrightProxyOptions(defaultRow[PX.PROXY_URL])
    : null;
  if (defaultPlaywright && defaultRow?.[PX.ID]) {
    return {
      playwright: defaultPlaywright,
      proxyId: defaultRow[PX.ID],
      source: "default",
      label: defaultRow[PX.LABEL] || maskProxyUrl(defaultRow[PX.PROXY_URL]),
    };
  }

  return {
    playwright: envFallback,
    proxyId: null,
    source: envFallback ? "env" : "none",
    label: envFallback?.server ?? null,
  };
}
async function markProxyCheckResult(id, { ok, error = null } = {}) {
  if (!PROXY_TABLE || !id) return;
  await db(PROXY_TABLE)
    .where(PX.ID, id)
    .update({
      [PX.IS_ALIVE]: ok === true,
      [PX.LAST_CHECKED_AT]: db.fn.now(),
      [PX.LAST_ERROR]: ok ? null : String(error || "Proxy test failed").slice(0, 500),
      [PX.UPDATED_AT]: db.fn.now(),
    });
}

async function createAdminProxy(payload) {
  if (!PROXY_TABLE) throw new Error("admin_proxy table chua cau hinh schema.");

  const parsedUrl = parseProxyLine(payload.raw_line ?? payload.proxy_url);
  if (!parsedUrl) {
    throw new Error(
      "Proxy khong hop le. Dung user:pass@host:port hoac host:port:user:pass"
    );
  }

  const isDefault = payload.is_default === true;
  const row = {
    [PX.LABEL]: String(payload.label ?? "").trim() || null,
    [PX.PROXY_URL]: parsedUrl,
    [PX.NOTE]: String(payload.note ?? "").trim() || null,
    [PX.IS_ACTIVE]: payload.is_active !== false,
    [PX.IS_DEFAULT]: isDefault,
    [PX.IS_ALIVE]: true,
    [PX.CREATED_AT]: db.fn.now(),
    [PX.UPDATED_AT]: db.fn.now(),
  };

  return db.transaction(async (trx) => {
    if (isDefault) await clearOtherDefaults(null, trx);
    const [inserted] = await trx(PROXY_TABLE).insert(row).returning("*");
    return toPublicRow(inserted);
  });
}

async function updateAdminProxy(id, payload) {
  if (!PROXY_TABLE) throw new Error("admin_proxy table chua cau hinh schema.");
  const existing = await getAdminProxyById(id);
  if (!existing) return null;

  const updates = { [PX.UPDATED_AT]: db.fn.now() };
  if (payload.label !== undefined) {
    updates[PX.LABEL] = String(payload.label ?? "").trim() || null;
  }
  if (payload.note !== undefined) {
    updates[PX.NOTE] = String(payload.note ?? "").trim() || null;
  }
  if (payload.raw_line !== undefined || payload.proxy_url !== undefined) {
    const parsedUrl = parseProxyLine(payload.raw_line ?? payload.proxy_url);
    if (!parsedUrl) throw new Error("Proxy khong hop le.");
    updates[PX.PROXY_URL] = parsedUrl;
    updates[PX.IS_ALIVE] = true;
    updates[PX.LAST_ERROR] = null;
  }
  if (payload.is_active !== undefined) updates[PX.IS_ACTIVE] = payload.is_active === true;
  if (payload.is_default !== undefined) updates[PX.IS_DEFAULT] = payload.is_default === true;
  if (payload.is_alive !== undefined) updates[PX.IS_ALIVE] = payload.is_alive === true;

  return db.transaction(async (trx) => {
    if (payload.is_default === true) await clearOtherDefaults(id, trx);
    const [updated] = await trx(PROXY_TABLE).where(PX.ID, id).update(updates).returning("*");
    return toPublicRow(updated);
  });
}

async function deleteAdminProxy(id) {
  if (!PROXY_TABLE) return false;
  const deleted = await db(PROXY_TABLE).where(PX.ID, id).del();
  return deleted > 0;
}

async function testAdminProxy(id) {
  const row = await getAdminProxyById(id);
  if (!row) throw new Error(`Khong tim thay proxy id=${id}.`);

  const proxyOptions = rowToPlaywrightOptions({ ...row, [PX.IS_ALIVE]: true });
  if (!proxyOptions) throw new Error("Proxy URL khong hop le.");

  const browser = await chromium.launch({
    headless: true,
    proxy: proxyOptions,
    args: getChromiumLaunchArgs({ useProxy: true }),
  });

  try {
    const page = await browser.newPage();
    let exitIp = null;

    // BÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc 1: test cÃƒâ€ Ã‚Â¡ bÃƒÂ¡Ã‚ÂºÃ‚Â£n giÃƒÂ¡Ã‚Â»Ã¢â‚¬Ëœng proxygenz (HTTP qua proxy, lÃƒÂ¡Ã‚ÂºÃ‚Â¥y IP ra)
    try {
      const basicResponse = await page.goto("http://httpbin.org/ip", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      if (!basicResponse || basicResponse.status() >= 500) {
        throw new Error(`HTTP ${basicResponse?.status() ?? "unknown"} tu httpbin.org`);
      }
      const body = await page.textContent("body");
      const parsed = JSON.parse(String(body || "{}").trim() || "{}");
      exitIp = parsed.origin ? String(parsed.origin).split(",")[0].trim() : null;
    } catch (basicErr) {
      await markProxyCheckResult(id, { ok: false, error: basicErr.message });
      throw new Error(`Proxy die ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â khong ket noi duoc: ${basicErr.message}`);
    }

    // BÃƒâ€ Ã‚Â°ÃƒÂ¡Ã‚Â»Ã¢â‚¬Âºc 2: thÃƒÂ¡Ã‚Â»Ã‚Â­ Adobe login (co disable-http2)
    let adobeNote = null;
    try {
      const adobeResponse = await page.goto("https://auth.services.adobe.com/", {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      if (!adobeResponse || adobeResponse.status() >= 500) {
        adobeNote = `Adobe HTTP ${adobeResponse?.status() ?? "unknown"}`;
      }
    } catch (adobeErr) {
      adobeNote = String(adobeErr.message || adobeErr).split("\n")[0];
    }

    await markProxyCheckResult(id, { ok: true });
    return {
      ok: true,
      id,
      proxy_url_masked: maskProxyUrl(row[PX.PROXY_URL]),
      exit_ip: exitIp,
      adobe_ok: !adobeNote,
      message: exitIp
        ? `Proxy OK ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â IP: ${exitIp}${adobeNote ? ` (Adobe: ${adobeNote})` : " ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Adobe OK"}`
        : `Proxy OK${adobeNote ? ` (Adobe: ${adobeNote})` : " ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Adobe OK"}`,
      adobe_warning: adobeNote,
    };
  } catch (err) {
    if (!String(err.message || "").startsWith("Proxy die")) {
      await markProxyCheckResult(id, { ok: false, error: err.message });
    }
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = {
  parseProxyLine,
  listAdminProxies,
  getAdminProxyById,
  resolvePlaywrightProxyForAdminLogin,
  markProxyCheckResult,
  createAdminProxy,
  updateAdminProxy,
  deleteAdminProxy,
  testAdminProxy,
  toPublicRow,
  PROXY_TABLE,
  PX_COLS: PX,
};
