import { test, expect } from "@playwright/test";

test.describe("Orders page", () => {
  test("navigates to orders and expects content to load", async ({ page }) => {
    await page.goto("/orders");

    // Unauthenticated users get redirected to login
    const url = page.url();
    if (url.includes("/login")) {
      await expect(page.locator("input[type='text']")).toBeVisible();
      return;
    }

    await expect(page.locator("table, [role='table']")).toBeVisible({
      timeout: 10_000,
    });
  });
});
