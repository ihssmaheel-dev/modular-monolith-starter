import { expect, test, type Page } from "@playwright/test";
import { registerAndVerify } from "./helpers";

async function register(page: Page, email: string) {
  await registerAndVerify(page, email, "Notify User");
}

test("a new user sees an empty notification center", async ({ page }) => {
  await register(page, `e2e-notif-${Date.now()}@example.test`);

  await expect(page.getByRole("button", { name: /notifications/i }).first()).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText(/you're all caught up/i)).toBeVisible();
});

test("registration raises a welcome notification that can be cleared", async ({ page }) => {
  await register(page, `e2e-welcome-${Date.now()}@example.test`);

  const listResponse = page.waitForResponse(
    (res) => res.url().includes("/rpc/notifications/list") && res.request().method() === "GET",
  );
  await page.goto("/notifications");
  await listResponse;
  await expect(page.getByText(/welcome/i).first()).toBeVisible();

  const readResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/rpc/notifications/markAllRead") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: /mark all as read|mark all read/i }).click();
  const finished = await readResponse;
  expect(finished.ok()).toBe(true);
  await expect(page.getByText(/you're all caught up/i)).toBeVisible();
});

test("notification preferences can be toggled, saved, and reloaded", async ({ page }) => {
  await register(page, `e2e-prefs-${Date.now()}@example.test`);

  await page.goto("/settings");
  await expect(page.getByText(/notification preferences/i)).toBeVisible();
  await page.getByRole("switch").first().click();
  const saveResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/rpc/notifications/updatePreferences") &&
      res.request().method() === "PUT",
  );
  await page.getByRole("button", { name: /^save$/i }).click();
  const finished = await saveResponse;
  expect(finished.ok()).toBe(true);

  await page.reload();
  await expect(page.getByText(/notification preferences/i)).toBeVisible();
});
