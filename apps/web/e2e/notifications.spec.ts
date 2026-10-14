import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { registerAndVerify } from "./helpers";
import type { NotificationListResponse } from "@repo/contracts";

async function register(page: Page, email: string) {
  await registerAndVerify(page, email, "Notify User");
}

test("a new user can open the notification center", async ({ page }) => {
  await register(page, `e2e-notif-${Date.now()}@example.test`);

  await expect(page.getByRole("button", { name: /notifications/i }).first()).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: /^notifications$/i })).toBeVisible();
});

test("registration raises a welcome notification that can be cleared", async ({ page }) => {
  await register(page, `e2e-welcome-${Date.now()}@example.test`);
  const apiOrigin = new URL(process.env.VITE_API_URL ?? "http://127.0.0.1:5156/api/v1").origin;
  // The outbox consumer is asynchronous. Await its persisted effect before opening the feed.
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${apiOrigin}/api/v1/rpc/notifications`);
        expect(response.ok()).toBe(true);
        const body = (await response.json()) as NotificationListResponse;
        return body.items.some((item) => item.type === "user.welcome");
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const listResponse = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname.replace(/\/$/, "").endsWith("/rpc/notifications") &&
      res.request().method() === "GET",
  );
  await page.goto("/notifications");
  await listResponse;
  await expect(page.getByText(/welcome/i).first()).toBeVisible({ timeout: 15_000 });

  const readResponse = page.waitForResponse(
    (res) => res.url().includes("/rpc/notifications/read-all") && res.request().method() === "POST",
  );
  await page.getByRole("button", { name: /mark all as read|mark all read/i }).click();
  const finished = await readResponse;
  expect(finished.ok()).toBe(true);
  await expect(page.getByText(/^unread$/i)).toHaveCount(0);
});

test("notification preferences can be toggled, saved, and reloaded", async ({ page }) => {
  await register(page, `e2e-prefs-${Date.now()}@example.test`);

  await page.goto("/settings");
  await page.getByRole("tab", { name: /^notifications$/i }).click();
  await expect(page.getByText(/notification preferences/i)).toBeVisible();
  const preference = page
    .getByText(/^account$/i)
    .locator("..")
    .getByRole("switch", { name: "In app", exact: true });
  const checkedBefore = await preference.getAttribute("aria-checked");
  await preference.click();
  const saveResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/rpc/notifications/preferences") && res.request().method() === "PUT",
  );
  await page.getByRole("button", { name: /^save$/i }).click();
  const finished = await saveResponse;
  expect(finished.ok()).toBe(true);

  await page.reload();
  await page.getByRole("tab", { name: /^notifications$/i }).click();
  await expect(page.getByText(/notification preferences/i)).toBeVisible();
  await expect(preference).toHaveAttribute(
    "aria-checked",
    checkedBefore === "true" ? "false" : "true",
  );
});
