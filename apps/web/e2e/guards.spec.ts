import { expect, test, type Page } from "@playwright/test";
import { registerAndVerify } from "./helpers";

async function registerAs(page: Page, email: string) {
  await registerAndVerify(page, email, "Guard User");
}

test("authenticated visitors are sent away from authentication", async ({ page }) => {
  await registerAs(page, `guard-auth-${Date.now()}@example.test`);
  await page.goto("/auth");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("non-admin visitors are sent away from user management", async ({ page }) => {
  await registerAs(page, `guard-users-${Date.now()}@example.test`);
  await page.goto("/users");
  await expect(page).toHaveURL(/\/dashboard$/);
});
