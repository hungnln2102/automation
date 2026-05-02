/**
 * Đóng dialog/overlay (vex + Adobe React Spectrum) còn sót trên Admin Console — tránh
 * "intercepts pointer events" khi click sidebar (vd. B15 → /users/administrators).
 */

const logger = require("../../../utils/logger");

const MAX_ATTEMPTS = 6;
const SPECTRUM_MAX = 12;

/**
 * Dialog Spectrum (class chứa spectrum-Dialog-grid) không phải vex — phải Escape / nút Close / OK.
 * Chỉ đóng dialog CHẶN thật sự; bỏ qua grid nằm trong modal thêm người dùng / chọn sản phẩm.
 */
async function dismissSpectrumDialogs(page, logPrefix) {
  for (let attempt = 0; attempt < SPECTRUM_MAX; attempt++) {
    const grids = page.locator("div[class*='spectrum-Dialog-grid']");
    const n = await grids.count().catch(() => 0);
    /** @type {import('playwright').Locator | null} */
    let dialog = null;

    for (let i = 0; i < n; i++) {
      const g = grids.nth(i);
      if (!(await g.isVisible({ timeout: 400 }).catch(() => false))) continue;

      const skip = await g.evaluate((node) => {
        let p = node.parentElement;
        while (p) {
          if (p.id === "add-users-to-org-modal") return true;
          if (p.getAttribute && p.getAttribute("data-testid") === "product-assignment-modal") {
            return true;
          }
          p = p.parentElement;
        }
        return false;
      });
      if (skip) continue;

      const dlg = page.getByRole("dialog").filter({ has: g });
      if (await dlg.isVisible({ timeout: 350 }).catch(() => false)) {
        dialog = dlg;
        break;
      }
    }

    if (!dialog) {
      return;
    }

    logger.info(
      "%s dismissSpectrumDialogs: Spectrum dialog chặn UI, lần %s/%s",
      logPrefix,
      attempt + 1,
      SPECTRUM_MAX
    );
    const tryClick = async (loc) => {
      const el = loc.first();
      if (await el.isVisible({ timeout: 400 }).catch(() => false)) {
        await el.click({ timeout: 6000, force: true }).catch(() => {});
        return true;
      }
      return false;
    };

    const closed =
      (await tryClick(dialog.locator('button[aria-label*="Close" i]'))) ||
      (await tryClick(dialog.locator('button[aria-label*="close" i]'))) ||
      (await tryClick(dialog.locator('[class*="spectrum-CloseButton"]'))) ||
      (await tryClick(dialog.getByRole("button", { name: /^Close$/i }))) ||
      (await tryClick(dialog.getByRole("button", { name: /^OK$/i }))) ||
      (await tryClick(dialog.getByRole("button", { name: /^Done$/i }))) ||
      (await tryClick(dialog.getByRole("button", { name: /got it/i }))) ||
      (await tryClick(
        dialog.locator('[data-testid="cta-button"]').filter({ hasText: /^(OK|Done|Close|Đóng)$/i })
      ));

    if (!closed) {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(900);
    // Vòng lặp tiếp: chỉ còn modal add-user / product-assignment → dialog=null → return
  }

  logger.warn("%s dismissSpectrumDialogs: vẫn còn Spectrum dialog sau %s lần", logPrefix, SPECTRUM_MAX);
}

/**
 * @param {import('playwright').Page} page
 * @param {{ logPrefix?: string }} opts
 */
async function dismissBlockingOverlays(page, opts = {}) {
  const logPrefix = opts.logPrefix || "[adobe-v2]";
  await dismissSpectrumDialogs(page, logPrefix);

  async function overlayBlocking() {
    return page
      .evaluate(() => {
        const overlays = document.querySelectorAll(".vex-overlay");
        for (const el of overlays) {
          const s = window.getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) {
            continue;
          }
          const r = el.getBoundingClientRect();
          if (r.width > 10 && r.height > 10) return true;
        }
        return false;
      })
      .catch(() => false);
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const blocking = await overlayBlocking();
    if (!blocking) return;

    logger.info(
      "%s dismissBlockingOverlays: vex overlay đang chặn click, lần %s/%s",
      logPrefix,
      attempt + 1,
      MAX_ATTEMPTS
    );

    const vexRoot = page.locator(".vex.vex-theme-os, .apt-vex").first();

    const primaryOk = vexRoot
      .locator(
        ".vex-dialog-button-primary, button.vex-dialog-button-primary, [data-testid='cta-button']"
      )
      .first();
    if (await primaryOk.isVisible({ timeout: 600 }).catch(() => false)) {
      await primaryOk.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      continue;
    }

    const closeBtn = page
      .locator(
        ".vex-close, .vex-dialog-button-secondary, .vex-dialog-button.vex-close, button[aria-label='Close' i], button[aria-label='Đóng' i]"
      )
      .first();
    if (await closeBtn.isVisible({ timeout: 600 }).catch(() => false)) {
      await closeBtn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      continue;
    }

    const genericDismiss = page
      .getByRole("button", { name: /^(OK|Ok|Đóng|Close|Dismiss|Hoàn tất|Done)$/i })
      .first();
    if (await genericDismiss.isVisible({ timeout: 400 }).catch(() => false)) {
      await genericDismiss.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      continue;
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
  }

  if (await overlayBlocking()) {
    logger.warn("%s dismissBlockingOverlays: vẫn còn overlay sau %s lần — gỡ vex khỏi DOM", logPrefix, MAX_ATTEMPTS);
    await page
      .evaluate(() => {
        document.querySelectorAll(".vex").forEach((el) => {
          try {
            el.remove();
          } catch (_) {}
        });
      })
      .catch(() => {});
    await page.waitForTimeout(400);
  }
}

module.exports = { dismissBlockingOverlays };
