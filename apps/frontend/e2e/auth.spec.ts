import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("redirects unauthenticated users to login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders form fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type='text']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("login form accepts credentials and submits", async ({ page }) => {
    await page.goto("/login");

    await page.locator("input[type='text']").fill("testuser");
    await page.locator("input[type='password']").fill("testpass");
    await page.locator("button[type='submit']").click();

    await expect(
      page.locator("button[type='submit']")
    ).not.toHaveText("Đang đăng nhập...", { timeout: 10_000 });
  });
});
