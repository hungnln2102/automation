const logger = require("../../../../../utils/logger");
const { withRecoverableRetry } = require("./retry");

const ADMIN_PRODUCTS = "https://adminconsole.adobe.com/products";

async function readOrgNameFromOrgSwitcher(page) {
  const btn = page.locator('button[data-testid="org-switch-button"]').first();
  try {
    await btn.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) return null;
  }

  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 5000 }).catch(() => {});
  await page
    .locator('[role="listbox"], [role="menu"]')
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(300);

  return page
    .evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const list =
        document.querySelector('[role="listbox"][aria-label]') ||
        document.querySelector('[role="listbox"]') ||
        document.querySelector('[class*="Menu" i][role="listbox"]');
      if (!list) return null;

      const options = Array.from(list.querySelectorAll('[role="option"]'));
      const getLabel = (opt) => {
        const labelId = opt.getAttribute("aria-labelledby");
        if (labelId) {
          const el = document.getElementById(labelId);
          if (el) return norm(el.textContent);
        }
        return norm(opt.textContent);
      };

      for (const opt of options) {
        const txt = norm(opt.textContent);
        if (/Business\s*ID/i.test(txt)) {
          return getLabel(opt).replace(/Business\s*ID.*$/i, "").trim() || getLabel(opt);
        }
      }
      const selected = options.find((o) => o.getAttribute("aria-selected") === "true") || options[0];
      if (!selected) return null;
      return getLabel(selected);
    })
    .catch(() => null);
}

async function runCheckOrgNameFlow(page, { existingOrgName = null } = {}) {
  const preset = existingOrgName && String(existingOrgName).trim() ? String(existingOrgName).trim() : null;
  if (preset) {
    logger.info("[adobe-v2] B10–B11: Bỏ qua (đã có org_name=%s)", preset);
    return { org_name: preset };
  }

  return withRecoverableRetry(
    "B10-B11-check-org-name",
    async () => {
      if (!page.url().includes("adminconsole.adobe.com")) {
        await page.goto(ADMIN_PRODUCTS, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
        await page.waitForTimeout(1500);
      }

      const org_name = await readOrgNameFromOrgSwitcher(page);
      if (org_name) {
        logger.info("[adobe-v2] B11: Profile Name (adminconsole org switch) = %s", org_name);
      } else {
        logger.warn("[adobe-v2] B10–B11: Không lấy được Profile Name từ org switch menu");
      }
      return { org_name: org_name || null };
    },
    { retries: 1, waitMs: 1200 }
  );
}

module.exports = {
  runCheckOrgNameFlow,
};
