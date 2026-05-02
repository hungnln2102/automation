/**
 * Test luồng Check Adobe (V2): checkAccount -> scrapedData (org_name, user_count, manageTeamMembers).
 *
 * Chạy từ thư mục backend:
 *   EMAIL=xxx PASSWORD=yyy node tests/manual/test-manage-team.js
 *
 * Có thể truyền cookies đã lưu (format { cookies: [], savedAt }):
 *   COOKIES_FILE=cookies/adobe_account_1.json EMAIL=xxx PASSWORD=yyy node tests/manual/test-manage-team.js
 */
require("dotenv").config();
const path = require("path");
const fs = require("fs");

const COOKIES_FILE =
  process.env.COOKIES_FILE || path.join("cookies", "adobe_account_1.json");

async function main() {
  const email = process.env.EMAIL || "";
  const password = process.env.PASSWORD || "";
  if (!email || !password) {
    console.error("Cần đặt EMAIL và PASSWORD (env hoặc .env).");
    process.exit(1);
  }

  console.log("========== TEST MANAGE-TEAM (Adobe V2 checkAccount) ==========\n");
  console.log("[test] Email:", email);
  console.log("[test] Cookies file (optional):", COOKIES_FILE);

  let savedCookiesFromDb = null;
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(COOKIES_FILE, "utf8"));
      savedCookiesFromDb =
        raw && Array.isArray(raw.cookies)
          ? raw
          : { cookies: raw.cookies || [], savedAt: raw.savedAt };
    } catch (_) {
      console.warn("[test] Không đọc được cookies file, chạy không dùng cookies.");
    }
  }

  const adobeRenewV2 = require("../../src/services/renew-adobe/adobe-renew-v2");

  try {
    console.log("[test] Gọi checkAccount (V2)...");
    const result = await adobeRenewV2.checkAccount(email, password, {
      savedCookiesFromDb,
    });
    if (!result.success) {
      console.error("\n[test] Check thất bại:", result.error);
      process.exit(1);
    }
    const sd = result.scrapedData;
    console.log("\n[test] Check thành công.");
    console.log("[test] orgName:", sd?.orgName ?? "(null)");
    console.log("[test] profileName:", sd?.profileName ?? "(null)");
    console.log("[test] userCount:", sd?.userCount ?? "(null)");
    console.log("[test] licenseStatus:", sd?.licenseStatus ?? "(null)");
    if (sd?.manageTeamMembers && Array.isArray(sd.manageTeamMembers)) {
      console.log("[test] manageTeamMembers count:", sd.manageTeamMembers.length);
      console.log(
        "[test] manageTeamMembers (raw):",
        JSON.stringify(sd.manageTeamMembers, null, 2)
      );
    }
    if (sd?.adminConsoleUsers?.length) {
      console.log("[test] adminConsoleUsers count:", sd.adminConsoleUsers.length);
    }
    console.log("\n========== KẾT THÚC TEST ==========");
    process.exit(0);
  } catch (err) {
    console.error("\n[test] Lỗi:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[test] Unhandled:", e);
  process.exit(1);
});
