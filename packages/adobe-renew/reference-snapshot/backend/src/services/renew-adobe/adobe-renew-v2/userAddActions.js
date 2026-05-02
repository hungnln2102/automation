/**
 * Add users + assign product via Admin Console UI (V2).
 * Luồng theo docs Renew_Adobe_V2.md dòng 326–345:
 *   1. Bấm "Thêm người dùng" → mở modal add-users-to-org-modal
 *   2. Mỗi user slot: nhập email vào combobox user-picker → dropdown → "Thêm làm người dùng mới"
 *   3. Bấm "+" (assignment-modal-open-button) → chọn product → "Áp dụng"
 *   4. Bấm "Lưu" cuối form
 *
 * Form hỗ trợ tối đa ~3 user slots cùng lúc. Nếu có > 3 emails thì submit theo batch.
 */

const logger = require("../../../utils/logger");
const { dismissBlockingOverlays } = require("./dismissBlockingOverlays");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickBestEffort(locator, timeout = 5000) {
  try {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout, force: true });
    return true;
  } catch (_) {}

  try {
    await locator.evaluate((el) => el.click());
    return true;
  } catch (_) {}

  return false;
}

async function waitForAssignButtonEnabled(modal, slotIndex, timeoutMs = 6000) {
  const assignButton = modal
    .locator('button[data-testid="assignment-modal-open-button"]')
    .nth(slotIndex);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const visible = await assignButton.isVisible({ timeout: 300 }).catch(() => false);
    if (visible) {
      const disabled = await assignButton.isDisabled().catch(() => true);
      if (!disabled) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Base URL …/{orgId}@AdobeOrg/users — dùng khi reload không ổn hoặc cần làm mới grid. */
function getUsersListUrlFromPage(page) {
  const url = page.url();
  const m = url.match(/^(https:\/\/adminconsole\.adobe\.com\/[^/]+@AdobeOrg)/);
  return m ? `${m[1]}/users` : null;
}

/**
 * Toast lỗi Spectrum sau Lưu (batch add) — vd. "already completed a free trial for teams".
 * User khác trong batch có thể đã được add; cần reload /users để scrape đúng.
 */
async function dismissAddUsersPostSaveErrorToast(page, logPrefix) {
  for (let i = 0; i < 12; i++) {
    const toastRoot = page.locator('[data-testid="modal-error"]').first();
    if (await toastRoot.isVisible({ timeout: 500 }).catch(() => false)) {
      const msg = await toastRoot.locator(".spectrum-Toast-content").first().innerText().catch(() => "");
      logger.warn(
        "%s: toast lỗi sau Lưu (partial save có thể đã thành công): %s",
        logPrefix,
        (msg || "").trim().slice(0, 500)
      );
      const closeBtn = toastRoot.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await closeBtn.click({ timeout: 6000, force: true }).catch(() => {});
      } else {
        await toastRoot.locator(".spectrum-ClearButton").first().click({ timeout: 6000, force: true }).catch(() => {});
      }
      await page.waitForTimeout(600);
      return true;
    }
    await page.waitForTimeout(350);
  }
  return false;
}

/** Reload trang Users sau add (hoặc sau khi đóng toast lỗi) để grid đồng bộ với server. */
async function reloadUsersListPageAfterAdd(page, logPrefix) {
  const usersUrl = getUsersListUrlFromPage(page);
  const reloaded = await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => false);
  if (!reloaded && usersUrl) {
    await page.goto(usersUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);
  await dismissBlockingOverlays(page, { logPrefix });
  await page
    .locator('button[data-testid="add-users-btn"]')
    .first()
    .waitFor({ state: "visible", timeout: 25000 })
    .catch(() => {});
}

/** Chờ modal add-user biến mất sau Lưu (tránh batch sau DOM/overlay lỗi). */
async function waitForAddUserModalGone(page, timeoutMs = 20000) {
  const modal = page.locator("#add-users-to-org-modal").first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await modal.isVisible().catch(() => false);
    if (!v) return;
    await page.waitForTimeout(400);
  }
}

/**
 * Sau khi bấm "Áp dụng" trong modal chọn sản phẩm, modal con phải đóng trước khi bấm "Lưu".
 * Nếu không, `cta-button`.first() trong modal cha có thể vẫn trỏ vào nút trong subtree product-assignment-modal
 * hoặc Playwright chờ actionable quá lâu → nhìn như treo sau log "bấm Áp dụng xong".
 */
async function waitForProductAssignmentModalClosed(page, timeoutMs = 20000) {
  const pm = page.locator('[data-testid="product-assignment-modal"]').first();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const vis = await pm.isVisible().catch(() => false);
    if (!vis) return true;
    await page.waitForTimeout(400);
  }
  logger.warn(
    "[adobe-v2] AddUsers: product-assignment-modal vẫn hiển thị sau %dms — vẫn thử bấm Lưu (có thể DOM chậm/mạng)",
    timeoutMs
  );
  return false;
}

/**
 * Bấm nút "Thêm người dùng" trên trang /users để mở modal.
 */
async function clickAddUserButton(page) {
  const candidates = [
    () => page.locator('button[data-testid="add-users-btn"]').first(),
    () => page.locator('button:has-text("Thêm người dùng")').first(),
    () => page.locator('button:has-text("Add user")').first(),
    () => page.getByRole("button", { name: /thêm người dùng|add user|add users/i }).first(),
    () => page.locator('[data-testid*="add-user" i], [data-testid*="addUsers" i]').first(),
  ];
  for (const getLocator of candidates) {
    try {
      const btn = getLocator();
      if (await btn.isVisible({ timeout: 3500 }).catch(() => false)) {
        const ok = await clickBestEffort(btn, 10000);
        if (ok) {
          await page.waitForTimeout(1200);
          return true;
        }
      }
    } catch (_) {}
  }
  return false;
}

/**
 * Chờ modal "Thêm người dùng vào nhóm bạn" (add-users-to-org-modal) xuất hiện.
 */
async function waitForAddUserModal(page, timeoutMs = 45000) {
  const selectors = [
    '#add-users-to-org-modal',
    '[role="dialog"][aria-labelledby]',
    '[role="dialog"]',
    '[aria-modal="true"]',
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: timeoutMs }).catch(() => false)) {
      return el;
    }
  }
  return null;
}

/**
 * Điền email vào combobox user-picker thứ `slotIndex` (0-based) trong modal.
 * Flow: fill email → bấm dropdown chevron → chọn "Thêm làm người dùng mới".
 */
async function fillEmailInSlot(page, modal, email, slotIndex) {
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm) return false;

  // Tìm tất cả user-picker inputs trong modal
  const allPickers = modal.locator('input[data-testid="user-picker"]');
  const pickerCount = await allPickers.count().catch(() => 0);

  if (slotIndex >= pickerCount) {
    logger.warn("[adobe-v2] fillEmailInSlot: slotIndex=%d >= pickerCount=%d", slotIndex, pickerCount);
    return false;
  }

  const picker = allPickers.nth(slotIndex);
  if (!(await picker.isVisible({ timeout: 5000 }).catch(() => false))) {
    logger.warn("[adobe-v2] fillEmailInSlot: picker slot %d not visible", slotIndex);
    return false;
  }

  // Clear và nhập email
  await picker.click({ timeout: 5000 }).catch(() => {});
  await picker.fill("").catch(() => {});
  await page.waitForTimeout(300);
  await picker.fill(emailNorm).catch(async () => {
    await page.keyboard.type(emailNorm, { delay: 20 });
  });
  await page.waitForTimeout(1200);

  // ── Mở dropdown ────────────────────────────────────────────────────────────
  // NOTE: Chevron button có tabindex="-1" → Playwright .click() mặc định CÓ THỂ skip.
  // Phải dùng { force: true } hoặc JS click.

  // Khai báo allChevrons 1 lần để dùng chung cho cả phần mở dropdown và retry
  const allChevrons = modal.locator('button[aria-label="Show suggestions"]');
  const chevronCount = await allChevrons.count().catch(() => 0);

  // Bước 0: Sau khi fill email, Adobe có thể tự mở dropdown suggestions → kiểm tra trước
  const newUserOptionCheck = page
    .locator('[data-testid="new-user-row"], [role="option"], [role="menuitem"], button, [role="button"], li, div')
    .filter({ hasText: /add as a new user|new user/i })
    .first();
  const autoOpened = await newUserOptionCheck.isVisible({ timeout: 2000 }).catch(() => false);

  if (!autoOpened) {
    let dropdownOpened = false;

    if (slotIndex < chevronCount) {
      const chevronBtn = allChevrons.nth(slotIndex);
      const chevronVisible = await chevronBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (chevronVisible) {
        // Dùng force:true vì button có tabindex="-1"
        const clickOk = await chevronBtn.click({ timeout: 5000, force: true }).then(() => true).catch(() => false);
        if (clickOk) {
          await page.waitForTimeout(1200);
          dropdownOpened = true;
          logger.info("[adobe-v2] fillEmailInSlot: bấm chevron slot %d OK (force)", slotIndex);
        } else {
          // JS click fallback (bypass tabindex hoàn toàn)
          await chevronBtn.evaluate((el) => el.click()).catch(() => {});
          await page.waitForTimeout(1200);
          dropdownOpened = true;
          logger.info("[adobe-v2] fillEmailInSlot: bấm chevron slot %d via JS click", slotIndex);
        }
      }
    }

    // Cách 2: nếu vẫn chưa mở, thử click lại input + ArrowDown
    if (!dropdownOpened) {
      logger.info("[adobe-v2] fillEmailInSlot: chevron không bấm được, thử ArrowDown");
      await picker.click({ timeout: 3000 }).catch(() => {});
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(1000);
    }
  } else {
    logger.info("[adobe-v2] fillEmailInSlot: dropdown tự mở sau khi fill email");
  }

  // ── Chọn "Thêm làm người dùng mới" ────────────────────────────────────────
  // Retry tối đa 3 lần
  for (let attempt = 0; attempt < 3; attempt++) {
    // Option có data-testid="new-user-row" (theo docs)
    const newUserOption = page.locator('[data-testid="new-user-row"]').first();
    if (await newUserOption.isVisible({ timeout: 4000 }).catch(() => false)) {
      await newUserOption.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      logger.info("[adobe-v2] fillEmailInSlot: chọn 'Thêm làm người dùng mới' cho %s (attempt %d)", emailNorm, attempt + 1);
      return true;
    }

    // Option text "người dùng mới" / "new user" (fallback text-based)
    const textOption = page.locator('[role="option"]').filter({
      hasText: /người dùng mới|new user/i,
    }).first();
    if (await textOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textOption.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      logger.info("[adobe-v2] fillEmailInSlot: fallback text option cho %s", emailNorm);
      return true;
    }

    // Option theo data-key email (Adobe dùng email làm key khi đã nhận ra user mới)
    const emailOption = page.locator(`[role="option"][data-key="${emailNorm}"]`).first();
    if (await emailOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailOption.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      logger.info("[adobe-v2] fillEmailInSlot: fallback data-key option cho %s", emailNorm);
      return true;
    }

    if (attempt < 2) {
      // Thử lại: click chevron hoặc ArrowDown lần nữa
      logger.info("[adobe-v2] fillEmailInSlot: option chưa hiện (attempt %d), thử mở lại dropdown", attempt + 1);
      if (slotIndex < chevronCount) {
        const chevronBtn = allChevrons.nth(slotIndex);
        await chevronBtn.click({ timeout: 3000 }).catch(() => {});
      } else {
        await picker.click({ timeout: 2000 }).catch(() => {});
        await page.keyboard.press("ArrowDown");
      }
      await page.waitForTimeout(1200);
    }
  }

  logger.warn("[adobe-v2] fillEmailInSlot: không thấy option nào cho %s", emailNorm);
  return false;
}

/**
 * Assign product cho user slot thứ `slotIndex` (0-based) trong modal.
 * Flow: bấm "+" (assignment-modal-open-button) → chọn product → "Áp dụng".
 */
async function fillEmailInSlotV2(page, modal, email, slotIndex) {
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm) return false;

  const allPickers = modal.locator('input[data-testid="user-picker"]');
  const pickerCount = await allPickers.count().catch(() => 0);
  if (slotIndex >= pickerCount) {
    logger.warn("[adobe-v2] fillEmailInSlotV2: slotIndex=%d >= pickerCount=%d", slotIndex, pickerCount);
    return false;
  }

  const picker = allPickers.nth(slotIndex);
  if (!(await picker.isVisible({ timeout: 5000 }).catch(() => false))) {
    logger.warn("[adobe-v2] fillEmailInSlotV2: picker slot %d not visible", slotIndex);
    return false;
  }

  await picker.click({ timeout: 5000 }).catch(() => {});
  await picker.fill("").catch(() => {});
  await page.waitForTimeout(250);
  await picker.fill(emailNorm).catch(async () => {
    await page.keyboard.type(emailNorm, { delay: 20 });
  });
  await page.waitForTimeout(1000);

  const allChevrons = modal.locator(
    'button[aria-label="Show suggestions"]:not([disabled]), button[aria-label="Hiển thị đề xuất"]:not([disabled]), button[aria-label*="suggestion" i]:not([disabled])'
  );
  const chevronCount = await allChevrons.count().catch(() => 0);
  const optionRegex =
    /add as a new user|new user|thêm làm người dùng mới|người dùng mới|làm người dùng mới/i;

  const getOptionCandidates = () => [
    page.locator('[data-testid="new-user-row"]').filter({ hasText: optionRegex }).first(),
    page.locator('[role="option"], [role="menuitem"]').filter({ hasText: optionRegex }).first(),
    page.locator('button, [role="button"], li, div').filter({ hasText: optionRegex }).first(),
    page.locator(`[role="option"][data-key="${emailNorm}"]`).first(),
    page.getByText(optionRegex).first(),
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    let dropdownOpened = false;

    for (const option of getOptionCandidates()) {
      const visible = await option.isVisible({ timeout: 600 }).catch(() => false);
      if (visible) {
        dropdownOpened = true;
        break;
      }
    }

    if (!dropdownOpened) {
      if (slotIndex < chevronCount) {
        const chevronBtn = allChevrons.nth(slotIndex);
        const chevronVisible = await chevronBtn.isVisible({ timeout: 1200 }).catch(() => false);
        if (chevronVisible) {
          dropdownOpened = await clickBestEffort(chevronBtn, 4000);
          if (dropdownOpened) {
            await page.waitForTimeout(900);
          }
        }
      }

      if (!dropdownOpened) {
        await picker.click({ timeout: 2500 }).catch(() => {});
        await page.keyboard.press("ArrowDown").catch(() => {});
        await page.waitForTimeout(700);
      }
    }

    let picked = false;
    for (const option of getOptionCandidates()) {
      const visible = await option.isVisible({ timeout: 1200 }).catch(() => false);
      if (!visible) {
        continue;
      }

      picked = await clickBestEffort(option, 4000);
      if (picked) {
        await page.waitForTimeout(1400);
        break;
      }
    }

    if (!picked) {
      await picker.click({ timeout: 2500 }).catch(() => {});
      await page.keyboard.press("ArrowDown").catch(() => {});
      await page.waitForTimeout(150);
      await page.keyboard.press("Enter").catch(() => {});
      await page.waitForTimeout(1200);
    }

    await dismissBlockingOverlays(page, { logPrefix: "[adobe-v2] fillEmailInSlotV2" });

    // Adobe bật nút "+" assign sau khi pipeline validate email — cần chờ > 4s ở một số org/locale
    const slotReady = await waitForAssignButtonEnabled(modal, slotIndex, 18_000);
    if (slotReady) {
      logger.info(
        "[adobe-v2] fillEmailInSlotV2: selected new user for %s (attempt %d)",
        emailNorm,
        attempt + 1
      );
      return true;
    }

    logger.warn(
      "[adobe-v2] fillEmailInSlotV2: assign button still disabled for %s (attempt %d)",
      emailNorm,
      attempt + 1
    );
    await page.waitForTimeout(900);
  }

  return false;
}

async function assignProductForSlot(page, modal, slotIndex) {
  // Tìm tất cả nút "+" (assignment-modal-open-button) trong modal — mỗi user slot có 1 nút
  const allAssignBtns = modal.locator('button[data-testid="assignment-modal-open-button"]');
  const btnCount = await allAssignBtns.count().catch(() => 0);

  if (slotIndex >= btnCount) {
    logger.warn("[adobe-v2] assignProductForSlot: slotIndex=%d >= btnCount=%d", slotIndex, btnCount);
    return false;
  }

  const assignBtn = allAssignBtns.nth(slotIndex);

  // Chờ nút enabled (disabled khi chưa nhập email)
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const disabled = await assignBtn.isDisabled().catch(() => true);
    if (!disabled) break;
    await page.waitForTimeout(500);
  }

  const disabled = await assignBtn.isDisabled().catch(() => true);
  if (disabled) {
    logger.warn("[adobe-v2] assignProductForSlot: nút assign slot %d vẫn disabled", slotIndex);
    return false;
  }

  await assignBtn.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Chờ modal "Chọn sản phẩm" (product-assignment-modal) xuất hiện
  const productModal = page.locator('[data-testid="product-assignment-modal"]').first();
  if (!(await productModal.isVisible({ timeout: 10000 }).catch(() => false))) {
    // Fallback: tìm dialog có text "Chọn sản phẩm" hoặc "Select products"
    const fallbackModal = page.locator('[role="dialog"]').filter({
      hasText: /chọn sản phẩm|select products/i,
    }).first();
    if (!(await fallbackModal.isVisible({ timeout: 5000 }).catch(() => false))) {
      logger.warn("[adobe-v2] assignProductForSlot: không thấy modal Chọn sản phẩm");
      return false;
    }
  }

  // Chọn product: click vào row trong product-select-list
  const productList = page.locator('[data-testid="product-select-list"]').first();
  let productClicked = false;

  if (await productList.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Ưu tiên: click row chứa "Creative Cloud" (sản phẩm chính)
    const ccRow = productList.locator('[role="row"]').filter({
      hasText: /creative cloud/i,
    }).first();
    if (await ccRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ccRow.click({ timeout: 5000 }).catch(() => {});
      productClicked = true;
      logger.info("[adobe-v2] assignProductForSlot: chọn Creative Cloud row");
    } else {
      // Fallback: click row đầu tiên
      const firstRow = productList.locator('[role="row"]').first();
      if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRow.click({ timeout: 5000 }).catch(() => {});
        productClicked = true;
        logger.info("[adobe-v2] assignProductForSlot: chọn row đầu tiên (fallback)");
      }
    }
  }

  if (!productClicked) {
    // Fallback: click checkbox trong product list
    const checkbox = page.locator('[data-testid="product-assignment-modal"] input[type="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click({ force: true }).catch(() => {});
      productClicked = true;
    }
  }

  if (!productClicked) {
    logger.warn("[adobe-v2] assignProductForSlot: không chọn được product nào");
    // Vẫn thử bấm Áp dụng (có thể product đã được tự chọn)
  }

  await page.waitForTimeout(800);

  // Bấm "Áp dụng" trong modal product (cta-button bên trong product-assignment-modal)
  const applyBtn = page.locator('[data-testid="product-assignment-modal"] button[data-testid="cta-button"]').first();
  if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Chờ nút enabled
    const applyDeadline = Date.now() + 8000;
    while (Date.now() < applyDeadline) {
      const dis = await applyBtn.isDisabled().catch(() => true);
      if (!dis) break;
      await page.waitForTimeout(500);
    }
    await applyBtn.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    logger.info("[adobe-v2] assignProductForSlot: bấm Áp dụng xong");
    return true;
  }

  // Fallback: tìm nút text "Áp dụng" hoặc "Apply" trong dialog
  const applyFallback = page.locator('[role="dialog"]').filter({
    hasText: /chọn sản phẩm|select products/i,
  }).locator('button').filter({ hasText: /áp dụng|apply/i }).first();
  if (await applyFallback.isVisible({ timeout: 3000 }).catch(() => false)) {
    await applyFallback.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return true;
  }

  logger.warn("[adobe-v2] assignProductForSlot: không bấm được Áp dụng");
  return false;
}

/**
 * Main: Add users vào org qua UI theo flow docs dòng 326.
 * Form có tối đa ~3 user slots. Nếu nhiều hơn → submit theo batch.
 */
async function addUsersToOrgViaUI(page, userEmails) {
  const emails = (userEmails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return { success: false, added: [], failed: [], error: "Danh sách email rỗng" };

  const added = [];
  const failed = [];
  const BATCH_SIZE = 3; // Form Adobe cho tối đa ~3 slot cùng lúc (một số org chỉ render 2 ô — xử lý theo pickerCount)

  let emailIdx = 0;
  while (emailIdx < emails.length) {
    const planned = Math.min(BATCH_SIZE, emails.length - emailIdx);
    const batchSlice = emails.slice(emailIdx, emailIdx + planned);
    logger.info(
      "[adobe-v2] AddUsers: batch index %d–%d / %d (planned %d)",
      emailIdx,
      emailIdx + batchSlice.length - 1,
      emails.length,
      planned
    );

    await dismissBlockingOverlays(page, { logPrefix: "[adobe-v2] AddUsers" });

    // 1. Bấm nút "Thêm người dùng"
    let clicked = await clickAddUserButton(page);
    if (!clicked) {
      const usersUrl = getUsersListUrlFromPage(page);
      if (usersUrl) {
        logger.info("[adobe-v2] AddUsers: không bấm được Thêm người dùng → goto %s rồi thử lại", usersUrl);
        await page.goto(usersUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2000);
        await dismissBlockingOverlays(page, { logPrefix: "[adobe-v2] AddUsers" });
        const addBtn = page.locator('button[data-testid="add-users-btn"]').first();
        await addBtn.waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
        clicked = await clickAddUserButton(page);
      }
    }
    if (!clicked) {
      batchSlice.forEach((e) => failed.push(e));
      logger.warn("[adobe-v2] AddUsers: không bấm được nút Thêm người dùng");
      emailIdx += planned;
      continue;
    }

    // 2. Chờ modal xuất hiện
    await page.waitForTimeout(1500);
    const modal = await waitForAddUserModal(page);
    if (!modal) {
      batchSlice.forEach((e) => failed.push(e));
      logger.warn("[adobe-v2] AddUsers: modal add-users-to-org không xuất hiện");
      emailIdx += planned;
      continue;
    }

    // 2b. Adobe đôi khi chỉ mount 2 input user-picker dù muốn thêm 3 — chờ DOM hoặc giảm chunk
    const pickerLocator = modal.locator('input[data-testid="user-picker"]');
    let pickerCount = await pickerLocator.count().catch(() => 0);
    const pickerWaitDeadline = Date.now() + 10000;
    while (pickerCount < planned && pickerCount < BATCH_SIZE && Date.now() < pickerWaitDeadline) {
      await page.waitForTimeout(400);
      pickerCount = await pickerLocator.count().catch(() => 0);
    }
    if (pickerCount === 0) {
      batchSlice.forEach((e) => failed.push(e));
      logger.warn("[adobe-v2] AddUsers: không thấy user-picker trong modal");
      emailIdx += planned;
      continue;
    }

    const chunkLen = Math.min(planned, pickerCount);
    const batch = batchSlice.slice(0, chunkLen);
    if (chunkLen < planned) {
      logger.info(
        "[adobe-v2] AddUsers: modal có %d user-picker — điền %d email; %d email còn lại sẽ xử lý ở lần mở modal tiếp",
        pickerCount,
        chunkLen,
        planned - chunkLen
      );
    }

    const batchAdded = [];

    // 3. Điền email + assign product cho mỗi slot
    for (let i = 0; i < batch.length; i++) {
      const email = batch[i];
      logger.info("[adobe-v2] AddUsers: slot %d → %s", i, email);

      const filled = await fillEmailInSlotV2(page, modal, email, i);
      if (!filled) {
        logger.warn("[adobe-v2] AddUsers: không điền được email %s vào slot %d", email, i);
        failed.push(email);
        continue;
      }

      await page.waitForTimeout(800);

      const assigned = await assignProductForSlot(page, modal, i);
      if (!assigned) {
        logger.warn("[adobe-v2] AddUsers: không assign được product cho %s (slot %d) — vẫn tiếp tục", email, i);
        // Không push vào failed vì user vẫn có thể được add mà chưa có product
      }

      batchAdded.push(email);
      added.push(email);
    }

    // 4. Bấm "Lưu" (cta-button trong modal chính — scope #add-users-to-org-modal để không nhầm cta trong modal chọn SP)
    if (batchAdded.length > 0) {
      await waitForProductAssignmentModalClosed(page);
      logger.info("[adobe-v2] AddUsers: chuẩn bị bấm Lưu (batch %d email)", batchAdded.length);

      const mainAddModal = page.locator("#add-users-to-org-modal").first();
      const saveBtn = mainAddModal.locator('button[data-testid="cta-button"]').first();
      let saved = false;

      if (await saveBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
        // Chờ nút enabled
        const saveDeadline = Date.now() + 10000;
        while (Date.now() < saveDeadline) {
          const dis = await saveBtn.isDisabled().catch(() => true);
          if (!dis) break;
          await page.waitForTimeout(500);
        }
        const dis = await saveBtn.isDisabled().catch(() => false);
        if (!dis) {
          await saveBtn.click({ timeout: 12000 }).catch(() => {});
          await page.waitForTimeout(2000);
          saved = true;
          logger.info("[adobe-v2] AddUsers: bấm Lưu xong (%d email)", batchAdded.length);
        }
      }

      if (!saved) {
        // Fallback: tìm nút text "Lưu" hoặc "Save" trong modal thêm user (không dùng dialog khác)
        const saveFallback = mainAddModal.getByRole("button", { name: /^lưu$|^save$/i }).first();
        if (await saveFallback.isVisible({ timeout: 3000 }).catch(() => false)) {
          await saveFallback.click({ timeout: 12000 }).catch(() => {});
          await page.waitForTimeout(2000);
          saved = true;
        }
      }

      if (!saved) {
        logger.warn("[adobe-v2] AddUsers: không bấm được Lưu cho batch");
      }
    }

    emailIdx += chunkLen;

    await page.waitForTimeout(1200);
    const hadPostSaveErrorToast = await dismissAddUsersPostSaveErrorToast(page, "[adobe-v2] AddUsers");
    if (hadPostSaveErrorToast) {
      logger.info("[adobe-v2] AddUsers: có toast lỗi sau Lưu → reload /users để đồng bộ danh sách");
      await reloadUsersListPageAfterAdd(page, "[adobe-v2] AddUsers");
    } else {
      await waitForAddUserModalGone(page);
    }
    await dismissBlockingOverlays(page, { logPrefix: "[adobe-v2] AddUsers" });
    await page.waitForTimeout(800);

    // Nếu còn email → làm mới trang Users và chờ UI sẵn sàng
    if (emailIdx < emails.length) {
      await dismissBlockingOverlays(page, { logPrefix: "[adobe-v2] AddUsers" });
      const reloaded = await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => false);
      if (!reloaded) {
        const usersUrl = getUsersListUrlFromPage(page);
        if (usersUrl) {
          await page.goto(usersUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        }
      }
      await page.waitForTimeout(2000);
      await dismissBlockingOverlays(page, { logPrefix: "[adobe-v2] AddUsers" });
      const addBtn = page.locator('button[data-testid="add-users-btn"]').first();
      await addBtn.waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  return {
    success: added.length > 0,
    added,
    failed,
  };
}

// ─── Legacy helpers (backward-compatible exports) ───────────────────────────────

async function waitForUserRowByEmail(page, email, timeoutMs = 30000) {
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm) return false;
  const emailRe = new RegExp(escapeRegex(emailNorm), "i");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = page.locator('[role="row"], table tr, tbody tr').filter({ hasText: emailRe }).first();
    if (await row.isVisible({ timeout: 1500 }).catch(() => false)) return true;
    await page.waitForTimeout(800);
  }
  return false;
}

async function selectUsersByEmails(page, emails) {
  const selected = [];
  for (const e of emails) {
    const emailNorm = String(e || "").trim().toLowerCase();
    if (!emailNorm) continue;
    const emailRe = new RegExp(escapeRegex(emailNorm), "i");
    const row = page.locator('[role="row"], table tr, tbody tr').filter({ hasText: emailRe }).first();
    const vis = await row.isVisible({ timeout: 2500 }).catch(() => false);
    if (!vis) continue;
    const cb = row.locator('input[type="checkbox"], [role="checkbox"]').first();
    if (await cb.isVisible({ timeout: 1500 }).catch(() => false)) {
      await cb.click({ force: true }).catch(() => {});
      selected.push(emailNorm);
    }
  }
  return selected;
}

module.exports = {
  addUsersToOrgViaUI,
  selectUsersByEmails,
  waitForUserRowByEmail,
};
