/**
 * Script test: chỉ chạy bước lấy org_name.
 *
 * Chạy:
 *   node tests/manual/test-org-name.js
 * Hoặc:
 *   COOKIE_FILE=cookies/adobe_account_1.json node tests/manual/test-org-name.js
 */
const path = require("path");
const fs = require("fs");

function loadCookiesFromFile(filePath) {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const data = JSON.parse(raw);
  const list = data.cookies || [];
  const sameSiteMap = {
    no_restriction: "None",
    strict: "Strict",
    lax: "Lax",
    unspecified: "Lax",
  };
  return list
    .filter(
      (c) => c.domain && (c.domain.includes("adobe.com") || c.domain === ".adobe.com")
    )
    .map((c) => {
      const p = {
        name: c.name,
        value: c.value || "",
        domain: c.domain,
        path: c.path || "/",
        httpOnly: !!c.httpOnly,
        secure: c.secure !== false,
      };
      const exp = c.expirationDate ?? c.expires;
      if (!c.session && exp) p.expires = Math.floor(Number(exp));
      const ss = sameSiteMap[c.sameSite] || "Lax";
      if (ss !== "Lax") p.sameSite = ss;
      return p;
    });
}

async function main() {
  const cookieFile =
    process.env.COOKIE_FILE ||
    path.join(process.cwd(), "cookies", "adobe_account_1.json");
  const resolved = path.isAbsolute(cookieFile)
    ? cookieFile
    : path.resolve(process.cwd(), cookieFile);
  if (!fs.existsSync(resolved)) {
    console.error("Cookie file không tồn tại:", cookieFile);
    process.exit(1);
  }

  const cookies = loadCookiesFromFile(cookieFile);
  console.log("Đã load", cookies.length, "cookies từ", cookieFile);
  if (cookies.length === 0) {
    console.error("Không có cookie Adobe nào trong file.");
    process.exit(1);
  }

  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS === "true",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    await page.goto("https://www.adobe.com", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.setCookie(...cookies);
    await page.goto("https://www.adobe.com", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 2000));

    await page
      .goto("https://account.adobe.com/?lang=vi", {
        waitUntil: "domcontentloaded",
        timeout: 35000,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 6000));
    await page.waitForSelector("p.plan-subtitle", { timeout: 12000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 2000));

    const orgName = await page
      .evaluate(() => {
        const el = document.querySelector("p.plan-subtitle");
        if (el && el.textContent && el.textContent.trim())
          return el.textContent.trim();
        const body = document.body?.innerText || "";
        const welcomeMatch = body.match(
          /Chào mừng\s+(.+?)\s+đến với tài khoản|Welcome\s+([^,!]+)/i
        );
        if (welcomeMatch) return (welcomeMatch[1] || welcomeMatch[2] || "").trim();
        return null;
      })
      .catch(() => null);

    console.log("\n========== KẾT QUẢ LẤY ORG_NAME ==========");
    console.log("org_name:", orgName === null ? "(null)" : JSON.stringify(orgName));
    console.log("==========================================\n");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
