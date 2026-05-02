/**
 * Cấu hình proxy cho Adobe Renew V2 (Playwright).
 *
 * Ưu tiên env:
 *   ADOBE_PROXY > ADOBE_HTTP_PROXY > HTTPS_PROXY > HTTP_PROXY
 */

/**
 * Parse URL proxy thành object dùng cho Playwright.
 * @param {string} url
 * @returns {{ server: string, username?: string, password?: string, host: string, port: number, protocol: string } | null}
 */
function parseProxyUrl(url) {
  const s = (url || "").trim();
  if (!s || s === "0" || s === "false") return null;

  try {
    const u = new URL(s);
    const protocol = u.protocol.replace(":", "") || "http";
    const host = u.hostname;
    const port = u.port ? parseInt(u.port, 10) : protocol === "https" ? 443 : 80;
    const server = `${protocol}://${host}${u.port ? `:${u.port}` : ""}`;

    const result = {
      server,
      host,
      port: Number.isFinite(port) ? port : 80,
      protocol,
    };
    if (u.username) result.username = decodeURIComponent(u.username);
    if (u.password) result.password = decodeURIComponent(u.password);
    return result;
  } catch (_) {
    return null;
  }
}

/**
 * Lấy cấu hình proxy từ env.
 * @returns {ReturnType<parseProxyUrl>}
 */
function getProxyConfig() {
  const url =
    process.env.ADOBE_PROXY ||
    process.env.ADOBE_HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    "";
  return parseProxyUrl(url);
}

/**
 * Trả về object proxy cho Playwright.
 * @returns {{ server: string, username?: string, password?: string } | undefined}
 */
function getPlaywrightProxyOptions() {
  const p = getProxyConfig();
  if (!p) return undefined;
  const opt = { server: p.server };
  if (p.username) opt.username = p.username;
  if (p.password) opt.password = p.password;
  return opt;
}

module.exports = {
  getProxyConfig,
  getPlaywrightProxyOptions,
  parseProxyUrl,
};
