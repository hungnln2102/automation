// backend/test-adobe.js
const puppeteer = require("puppeteer");

(async () => {
  try {
    console.log("[test-adobe] Launching browser (system Chromium)...");
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: "/usr/bin/chromium-browser",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-http2",
      ],
    });

    const page = await browser.newPage();
    console.log("[test-adobe] goto https://example.com ...");
    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    console.log("[test-adobe] Loaded OK. Current URL:", page.url());
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("[test-adobe] Puppeteer test failed:", err);
    process.exit(1);
  }
})();