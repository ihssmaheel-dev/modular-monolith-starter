import { expect, test } from "@playwright/test";
import { registerAndVerify } from "./helpers";

test("signed-out visitors are sent to authentication", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("tab", { name: /sign up|register/i })).toBeVisible();
});

test("a new user can register, create a note, and sign out", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await registerAndVerify(page, email, "E2E User");

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/notes/new");
  await page.getByLabel(/title/i).fill("E2E note");
  await page.getByLabel(/content/i).fill("Created through the browser flow.");
  await page.getByRole("button", { name: /create note/i }).click();

  await expect(page).toHaveURL(/\/notes\/.+/);
  await expect(page.getByText("E2E note")).toBeVisible();
  await expect(page.getByText(/attachments/i)).toBeVisible();
  await page.getByRole("button", { name: /profile/i }).click();
  await page.getByRole("menuitem", { name: /sign out|logout/i }).click();
  await expect(page).toHaveURL(/\/auth$/);
});

test("a note attachment can be uploaded and listed", async ({ page }) => {
  const email = `e2e-files-${Date.now()}@example.test`;
  await registerAndVerify(page, email, "E2E Files");

  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/notes/new");
  await page.getByLabel(/title/i).fill("E2E attachments");
  await page.getByLabel(/content/i).fill("Note with files.");
  await page.getByRole("button", { name: /create note/i }).click();
  await expect(page).toHaveURL(/\/notes\/.+/);

  const fileChooser = page.waitForEvent("filechooser");
  await page.getByText(/drag files here/i).click();
  await (
    await fileChooser
  ).setFiles({
    name: "hello.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello attachments"),
  });
  await expect(page.getByText("hello.txt")).toBeVisible();
});

test("forgot-password does not reveal account existence", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("link", { name: /forgot password/i }).click();
  await expect(page).toHaveURL(/\/auth\/forgot-password$/);
  await page.locator("#forgot-email").fill("unknown@example.test");
  await page.getByRole("button", { name: /send reset link/i }).click();
  await expect(page.getByText(/check|sent|email/i)).toBeVisible();
});
