/**
 * So sánh response JIL users API khi gọi bằng cùng header:
 *  - trang hiện tại: /{org}@AdobeOrg/users
 *  - trang hiện tại: /{org}@AdobeOrg/ (home/dashboard)
 *
 * Cần session Adobe hợp lệ. Env:
 *   ADOBE_V2_TEST_EMAIL, ADOBE_V2_TEST_PASSWORD
 *
 * Chạy từ thư mục backend:
 *   node tests/manual/jil-home-vs-users-api.js
 *
 * Tuỳ chọn: PLAYWRIGHT_HEADLESS=false để xem trình duyệt
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { chromium } = require("playwright");
const { runCheckFlow } = require("../../src/services/renew-adobe/adobe-renew-v2/runCheckFlow");
const {
  captureUsersApiHeaders,
  extractOrgTokenFromUrl,
} = require("../../src/services/renew-adobe/adobe-renew-v2/shared/usersListApi");

function buildJilUsersUrl(orgToken) {
  const t = String(orgToken || "").includes("@")
    ? orgToken
    : `${String(orgToken).trim().toUpperCase()}@AdobeOrg`;
  const q =
    "filter_exclude_domain=techacct.adobe.com" +
    "&page=0&page_size=20&search_query=&sort=FNAME_LNAME&sort_order=ASC" +
    "&currentPage=1&filterQuery=&include=DOMAIN_ENFORCEMENT_EXCEPTION_INDICATOR";
  return `https://bps-il.adobe.io/jil-api/v2/organizations/${encodeURIComponent(
    t
  )}/users/?${q}`;
}

async function main() {
  const email = process.env.ADOBE_V2_TEST_EMAIL || process.env.ADOBE_CHECK_EMAIL;
  const password =
    process.env.ADOBE_V2_TEST_PASSWORD || process.env.ADOBE_CHECK_PASSWORD;
  if (!email || !password) {
    console.log(
      "[jil-home-vs-users] BỎ QUA: thiếu ADOBE_V2_TEST_EMAIL + ADOBE_V2_TEST_PASSWORD (hoặc ADOBE_CHECK_*) trong backend/.env"
    );
    process.exit(0);
  }

  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const sharedSession = { context, page };

  console.log("[jil-home-vs-users] Đang đăng nhập (onlyLogin)…");
  const login = await runCheckFlow(email, password, {
    sharedSession,
    onlyLogin: true,
    savedCookies: [],
  });

  if (!login.success) {
    console.error("[jil-home-vs-users] Login thất bại:", login.error);
    await browser.close().catch(() => {});
    process.exit(1);
  }

  const pg = sharedSession.page;
  const orgToken = extractOrgTokenFromUrl(pg.url());
  if (!orgToken) {
    console.error(
      "[jil-home-vs-users] Không bắt được org từ URL sau login:",
      pg.url()
    );
    await browser.close().catch(() => {});
    process.exit(1);
  }

  const jilUrl = buildJilUsersUrl(orgToken);
  console.log("[jil-home-vs-users] orgToken =", orgToken);
  console.log("[jil-home-vs-users] JIL URL    =", jilUrl.slice(0, 100) + "…");

  // Bắt header từ flow chuẩn (lần 1: đi users + reload tương tự code)
  console.log("\n--- Bước 1: lấy header khi tới /users (fetchUsers JIL) ---");
  const usersHref = `https://adminconsole.adobe.com/${orgToken}/users`;
  await pg.goto(usersHref, { waitUntil: "domcontentloaded", timeout: 60000 });
  const headers = await captureUsersApiHeaders(pg, orgToken);
  const api = pg.context().request;

  const resOnUsers = await api.get(jilUrl, { headers, timeout: 45000 });
  const textOnUsers = await resOnUsers.text();
  const statusUsers = resOnUsers.status();
  let jsonUsers = null;
  try {
    jsonUsers = JSON.parse(textOnUsers);
  } catch {
    /* raw */
  }
  const itemsUsers = Array.isArray(jsonUsers) ? jsonUsers : jsonUsers?.items || jsonUsers?.data;

  console.log("URL trang:     ", pg.url().slice(0, 100));
  console.log("HTTP status:   ", statusUsers);
  console.log("Body length:   ", textOnUsers.length);
  console.log(
    "Items (Ước lượng):",
    Array.isArray(itemsUsers) ? itemsUsers.length : "n/a (parse?)"
  );

  // Cùng header, trang = home (gốc org)
  const homeUrl = `https://adminconsole.adobe.com/${orgToken}/`;
  console.log("\n--- Bước 2: cùng header, gọi lại khi đang ở home ---");
  await pg.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  const resOnHome = await api.get(jilUrl, { headers, timeout: 45000 });
  const textOnHome = await resOnHome.text();
  const statusHome = resOnHome.status();
  let jsonHome = null;
  try {
    jsonHome = JSON.parse(textOnHome);
  } catch {
    /* raw */
  }
  const itemsHome = Array.isArray(jsonHome) ? jsonHome : jsonHome?.items || jsonHome?.data;

  console.log("URL trang:     ", pg.url().slice(0, 100));
  console.log("HTTP status:   ", statusHome);
  console.log("Body length:   ", textOnHome.length);
  console.log(
    "Items (Ước lượng):",
    Array.isArray(itemsHome) ? itemsHome.length : "n/a (parse?)"
  );

  const sameStatus = statusUsers === statusHome;
  const sameBody = textOnUsers === textOnHome;
  console.log("\n========== KẾT QUẢ SO SÁNH (cùng header, 2 lần GET) ==========");
  console.log("Status giống nhau:     ", sameStatus, statusUsers, "vs", statusHome);
  console.log("Body giống hệt (raw):  ", sameBody);
  if (!sameBody && textOnUsers.length === textOnHome.length) {
    console.log("(Body khác dài nhau nhỏ — có thể do timestamp/request id trong JSON)");
  }
  if (sameStatus && sameBody) {
    console.log("→ Cùng token + query, response không phụ thuộc URL trang hiện tại (home vs users).");
  }

  await browser.close().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  console.error("[jil-home-vs-users] Lỗi:", e);
  process.exit(1);
});
