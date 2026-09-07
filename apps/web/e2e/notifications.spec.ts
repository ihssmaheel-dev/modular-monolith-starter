import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, email: string) {
  await page.goto("/auth");
  await page.getByRole("tab", { name: /sign up|register/i }).click();
  await page.locator("#reg-name").fill("Notify User");
  await page.locator("#reg-email").fill(email);
  await page.locator("#reg-password").fill("Password123!");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("a new user sees an empty notification center", async ({ page }) => {
  await register(page, `e2e-notif-${Date.now()}@example.test`);

  await expect(page.getByRole("button", { name: /notifications/i }).first()).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText(/you're all caught up/i)).toBeVisible();
});

test("notification preferences can be toggled and saved", async ({ page }) => {
  await register(page, `e2e-prefs-${Date.now()}@example.test`);

  await page.goto("/settings");
  await expect(page.getByText(/notification preferences/i)).toBeVisible();
  await page.getByRole("switch").first().click();
  await page.getByRole("button", { name: /^save$/i }).click();
});
