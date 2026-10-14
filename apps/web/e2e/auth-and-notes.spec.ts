import { expect, test } from "./fixtures";
import { registerAndVerify } from "./helpers";

test("signed-out visitors are sent to authentication", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
});

test("a new user can register, create a note, and sign out", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await registerAndVerify(page, email, "E2E User");

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: /switch organization/i })).toBeVisible();
  await page.goto("/notes/new");
  await page.getByLabel(/title/i).fill("E2E note");
  await page.getByLabel(/content/i).fill("Created through the browser flow.");
  await page.getByRole("button", { name: /create note/i }).click();

  await expect(page).toHaveURL(/\/notes\/.+/);
  await expect(page.getByText("E2E note")).toBeVisible();
  await expect(page.getByText(/^attachments$/i)).toBeVisible();
  await page.getByLabel(/^profile settings$/i).click();
  await page.getByRole("menuitem", { name: /sign out|log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
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
  // Wait for scan, promotion, and attachment, not just the optimistic upload row.
  await expect(page.getByRole("button", { name: /^download$/i })).toBeVisible({ timeout: 15_000 });
});

test("forgot-password does not reveal account existence", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /forgot password/i }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.locator("#forgot-email").fill("unknown@example.test");
  await page.getByRole("button", { name: /send reset link/i }).click();
  await expect(page.getByRole("heading", { name: /^check your email$/i })).toBeVisible();
});
