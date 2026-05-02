/**
 * Capture toàn bộ HTTP request/response khi login Adobe.
 * Chạy trên máy LOCAL (headless=false) để xem browser + bắt network:
 *
 *   node scripts/capture-adobe-flow.js <email> <password>
 *
 * Output: scripts/captured-flow.json — chứa tất cả request Adobe gửi/nhận.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const email = process.argv[2] || process.env.CAPTURE_EMAIL || "";
const password = process.argv[3] || process.env.CAPTURE_PASSWORD || "";

if (!email || !password) {
  console.error("Usage: node scripts/capture-adobe-flow.js <email> <password>");
  process.exit(1);
}

const OUTPUT_FILE = path.join(__dirname, "captured-flow.json");

(async () => {
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: null,
    slowMo: 80,
  });

  const page = await browser.newPage();
  const captured = [];

  page.on("request", (req) => {
    const url = req.url();
    if (!url.includes("adobe") && !url.includes("adobelogin")) return;
    captured.push({
      type: "request",
      timestamp: Date.now(),
      method: req.method(),
      url,
      headers: req.headers(),
      postData: req.postData() || null,
      resourceType: req.resourceType(),
    });
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("adobe") && !url.includes("adobelogin")) return;
    let body = null;
    try {
      const ct = res.headers()["content-type"] || "";
      if (ct.includes("json") || ct.includes("text") || ct.includes("html")) {
        body = await res.text().catch(() => null);
        if (body && body.length > 50000) body = body.slice(0, 50000) + "...[truncated]";
      }
    } catch (_) {}
    captured.push({
      type: "response",
      timestamp: Date.now(),
      status: res.status(),
      url,
      headers: res.headers(),
      body,
    });
  });

  console.log("[capture] Mở trang login Adobe...");
  const loginUrl =
    "https://auth.services.adobe.com/en_US/index.html?client_id=homepage_milo&scope=AdobeID%2Copenid%2Cgnav%2Cpps.read%2Cfirefly_api%2Cadditional_info.roles%2Cread_organizations%2Caccount_cluster.read&response_type=token&redirect_uri=https%3A%2F%2Fwww.adobe.com%2Fhome&flow_type=token&idp_flow_type=login&locale=en_US";

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

  console.log("[capture] Điền email...");
  const emailInput = await page.waitForSelector(
    'input[name="username"], input[type="email"]',
    { timeout: 30000 }
  );
  await emailInput.click({ clickCount: 3 });
  await emailInput.type(email, { delay: 30 });
  await page.keyboard.press("Enter");

  await new Promise((r) => setTimeout(r, 5000));

  console.log("[capture] Điền password...");
  try {
    const pwInput = await page.waitForSelector(
      'input[name="password"], input[type="password"]',
      { timeout: 30000 }
    );
    await pwInput.click({ clickCount: 3 });
    await pwInput.type(password, { delay: 30 });
    await page.keyboard.press("Enter");
  } catch (e) {
    console.warn("[capture] Không tìm thấy ô password, có thể cần 2FA:", e.message);
  }

  console.log("[capture] Chờ 60s để hoàn tất login (OTP nếu cần)...");
  console.log("[capture] Bạn có thể thao tác thủ công trên browser nếu cần OTP.");
  await new Promise((r) => setTimeout(r, 60000));

  console.log("[capture] Vào Admin Console...");
  try {
    await page.goto("https://adminconsole.adobe.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 10000));

    await page.goto("https://adminconsole.adobe.com/products", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 10000));

    await page.goto("https://adminconsole.adobe.com/users", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 10000));
  } catch (e) {
    console.warn("[capture] Lỗi khi vào Admin Console:", e.message);
  }

  const cookies = await page.cookies(
    "https://www.adobe.com",
    "https://auth.services.adobe.com",
    "https://adminconsole.adobe.com"
  );

  const output = {
    capturedAt: new Date().toISOString(),
    email,
    finalUrl: page.url(),
    requestCount: captured.length,
    cookies,
    requests: captured,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log("[capture] Đã lưu %s requests vào %s", captured.length, OUTPUT_FILE);
  console.log("[capture] Cookies: %s", cookies.length);

  await browser.close();
  process.exit(0);
})();
