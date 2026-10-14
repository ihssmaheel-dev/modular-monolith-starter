import { expect, test } from "./fixtures";
import { registerForm, verificationTokenFor, verifyAndEnterWorkspace } from "./helpers";

test("registration pends, login stays blocked, resend works, link verifies", async ({ page }) => {
  const email = `e2e-verify-${Date.now()}@example.test`;
  await registerForm(page, email, "Verify User");

  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await expect(page).not.toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: /resend verification/i }).click();
  await expect(page.getByText(/verification email sent/i)).toBeVisible();

  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill("Password123!");
  const deniedLogin = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/rpc/auth/login"),
  );
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  expect((await deniedLogin).status()).toBe(401);
  await expect(page.getByText(/^login failed$/i)).toBeVisible();
  await expect(page).not.toHaveURL(/\/dashboard$/);

  const token = await verificationTokenFor(email);
  await verifyAndEnterWorkspace(page, token);

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a consumed token cannot verify twice", async ({ page }) => {
  const email = `e2e-reuse-${Date.now()}@example.test`;
  await registerForm(page, email, "Reuse User");

  const token = await verificationTokenFor(email);
  await verifyAndEnterWorkspace(page, token);

  await page.goto(`/verify-email?token=${token}`);
  await page.getByRole("button", { name: /verify email/i }).click();
  await expect(page.getByText(/invalid/i).first()).toBeVisible();
  await expect(page).not.toHaveURL(/\/dashboard$/);
});

test("a bogus token shows an error, not a session", async ({ page }) => {
  await page.goto(`/verify-email?token=${"0".repeat(64)}`);
  await page.getByRole("button", { name: /verify email/i }).click();
  await expect(page.getByText(/invalid/i).first()).toBeVisible();
  await expect(page).not.toHaveURL(/\/dashboard$/);
});
