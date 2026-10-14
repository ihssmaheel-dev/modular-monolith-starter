import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { registerAndVerify } from "./helpers";

async function registerAs(page: Page, email: string) {
  await registerAndVerify(page, email, "Guard User");
}

test("authentication fields wait for hydration before accepting input", async ({ page }) => {
  let releaseScripts = () => {};
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  // Hold application scripts to reproduce a slow first visit to the SSR form.
  await page.route("**/assets/*.js", async (route) => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/register", { waitUntil: "commit" });
    await expect(page.getByLabel(/^name$/i)).toBeDisabled();
  } finally {
    releaseScripts();
  }
  await expect(page.getByLabel(/^name$/i)).toBeEnabled();
  await page.getByLabel(/^name$/i).fill("Hydrated user");
  await expect(page.getByLabel(/^name$/i)).toHaveValue("Hydrated user");
});

test("authenticated visitors are sent away from authentication", async ({ page }) => {
  await registerAs(page, `guard-auth-${Date.now()}@example.test`);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: /switch organization/i })).toBeVisible();
  await page.goto("/auth");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: /switch organization/i })).toBeVisible();
});

test("non-admin visitors are sent away from user management", async ({ page }) => {
  await registerAs(page, `guard-users-${Date.now()}@example.test`);
  await page.goto("/users");
  await expect(page).toHaveURL(/\/dashboard$/);
});
