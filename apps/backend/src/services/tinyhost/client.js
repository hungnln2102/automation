/**
 * TinyHost Temp Mail API client.
 * Docs: https://tinyhost.shop/api-docs.html
 */

const logger = require("../../utils/logger");

const BASE_URL = process.env.TINYHOST_BASE_URL || "https://tinyhost.shop";
const TIMEOUT_MS = Number(process.env.TINYHOST_TIMEOUT_MS) || 15_000;

async function request(path, { method = "GET", timeout = TIMEOUT_MS } = {}) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { method, signal: controller.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data?.detail || data?.error || res.statusText;
      const err = new Error(`TinyHost ${method} ${path}: ${res.status} ${detail}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Đọc danh sách email.
 * @param {string} domain - ví dụ "example.com"
 * @param {string} user   - ví dụ "testuser"
 * @param {{ page?: number, limit?: number }} opts
 * @returns {Promise<{ emails: Array, total: number, page: number, has_more: boolean }>}
 */
async function listEmails(domain, user, { page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return request(`/api/email/${encodeURIComponent(domain)}/${encodeURIComponent(user)}/?${params}`);
}

/**
 * Đọc chi tiết 1 email.
 * @param {string} domain
 * @param {string} user
 * @param {number|string} emailId
 * @returns {Promise<{ id, subject, sender, date, body, html_body, has_attachments }>}
 */
async function getEmail(domain, user, emailId) {
  return request(`/api/email/${encodeURIComponent(domain)}/${encodeURIComponent(user)}/${emailId}`);
}

/**
 * Xóa 1 email.
 * @returns {Promise<{ status: "deleted" }>}
 */
async function deleteEmail(domain, user, emailId) {
  return request(
    `/api/email/${encodeURIComponent(domain)}/${encodeURIComponent(user)}/${emailId}`,
    { method: "DELETE" }
  );
}

/**
 * Xóa tất cả email của 1 user (đọc rồi xóa từng cái).
 * @returns {Promise<number>} Số email đã xóa
 */
async function deleteAllEmails(domain, user) {
  let deleted = 0;
  let page = 1;
  while (true) {
    const result = await listEmails(domain, user, { page, limit: 100 });
    if (!result.emails?.length) break;
    for (const email of result.emails) {
      try {
        await deleteEmail(domain, user, email.id);
        deleted++;
      } catch (err) {
        logger.warn("[TinyHost] Failed to delete email", { emailId: email.id, error: err.message });
      }
    }
    if (!result.has_more) break;
    page++;
  }
  return deleted;
}

/**
 * Lấy danh sách domain online.
 */
async function getAllDomains() {
  return request("/api/all-domains/");
}

/**
 * Lấy domain ngẫu nhiên.
 */
async function getRandomDomains(limit = 10) {
  return request(`/api/random-domains/?limit=${limit}`);
}

/**
 * Kiểm tra MX record.
 * @returns {Promise<{ result: "online"|"offline" }>}
 */
async function checkMx(domain) {
  return request(`/api/check-mx/${encodeURIComponent(domain)}`);
}

/**
 * Thêm domain mới.
 * @returns {Promise<{ status: "added"|"updated", domain, is_online }>}
 */
async function addDomain(domain) {
  return request(`/api/add-domain/${encodeURIComponent(domain)}`, { method: "POST" });
}

/**
 * Chờ email mới đến (polling).
 * @param {string} domain
 * @param {string} user
 * @param {{ filter?: (email) => boolean, timeoutMs?: number, intervalMs?: number }} opts
 * @returns {Promise<object|null>} Email khớp filter, hoặc null nếu timeout
 */
async function waitForEmail(domain, user, {
  filter = () => true,
  timeoutMs = 120_000,
  intervalMs = 3_000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await listEmails(domain, user, { page: 1, limit: 10 });
    const match = result.emails?.find(filter);
    if (match) return match;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

module.exports = {
  listEmails,
  getEmail,
  deleteEmail,
  deleteAllEmails,
  getAllDomains,
  getRandomDomains,
  checkMx,
  addDomain,
  waitForEmail,
};
