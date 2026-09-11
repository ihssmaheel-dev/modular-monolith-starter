import { expect, test, type Page } from "@playwright/test";
import { registerAndVerify } from "./helpers";

async function register(page: Page, email: string, name: string) {
  await registerAndVerify(page, email, name);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /profile/i }).click();
  await page.getByRole("menuitem", { name: /sign out|logout/i }).click();
  await expect(page).toHaveURL(/\/auth$/);
}

test("signing out in one tab signs out the other tab", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await register(first, `e2e-xtab-${Date.now()}@example.test`, "Cross Tab");

  await second.goto("/dashboard");
  await expect(second).toHaveURL(/\/dashboard$/);

  await signOut(first);

  await expect(second).toHaveURL(/\/auth$/, { timeout: 10000 });
  await second.close();
  await first.close();
});

test("a note created in one tab appears in the other without reload", async ({ context }) => {
  const title = `Cross-tab ${Date.now()}`;
  const first = await context.newPage();
  const second = await context.newPage();
  await register(first, `e2e-xfetch-${Date.now()}@example.test`, "Cross Fetch");

  await second.goto("/notes");
  await expect(second.getByText("No notes yet. Create one above!")).toBeVisible();

  await first.goto("/notes/new");
  await first.getByLabel(/title/i).fill(title);
  await first.getByLabel(/content/i).fill("Created in the sibling tab.");
  await first.getByRole("button", { name: /create note/i }).click();
  await expect(first).toHaveURL(/\/notes\/.+/);

  await first.goto("/notes");
  await expect(first.getByText(title)).toBeVisible();

  await expect(second.getByText(title)).toBeVisible({ timeout: 10000 });
  await second.close();
  await first.close();
});
