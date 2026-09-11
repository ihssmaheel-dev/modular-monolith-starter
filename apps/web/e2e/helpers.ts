import { expect, type Page } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MailpitSearchResult {
  messages?: Array<{ ID?: string; Date?: string }>;
}

interface MailpitMessage {
  HTML?: string;
}

/** Reads the newest verification token from the real emailed link via Mailpit. */
export async function verificationTokenFor(email: string): Promise<string> {
  const deadline = Date.now() + 20000;
  for (;;) {
    const search = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(email)}&limit=10`,
    );
    if (search.ok) {
      const data = (await search.json()) as MailpitSearchResult;
      // Newest first: a resend invalidates earlier tokens server-side.
      const ordered = [...(data.messages ?? [])].sort((a, b) =>
        (b.Date ?? "").localeCompare(a.Date ?? ""),
      );
      for (const summary of ordered) {
        if (!summary.ID) continue;
        const message = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${summary.ID}`)
        ).json()) as MailpitMessage;
        const match = (message.HTML ?? "").match(/\/verify-email\?token=([0-9a-f]{32,})/);
        if (match?.[1]) return match[1];
      }
    }
    if (Date.now() > deadline) throw new Error(`no verification email found for ${email}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export async function registerForm(page: Page, email: string, name: string): Promise<void> {
  await page.goto("/auth");
  await page.getByRole("tab", { name: /sign up|register/i }).click();
  await page.locator("#reg-name").fill(name);
  await page.locator("#reg-email").fill(email);
  await page.locator("#reg-password").fill("Password123!");
  await page.getByRole("button", { name: /create account/i }).click();
}

/** Registers, lands on the pending screen, verifies through the emailed link. */
export async function registerAndVerify(page: Page, email: string, name: string): Promise<void> {
  await registerForm(page, email, name);
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  const token = await verificationTokenFor(email);
  await page.goto(`/verify-email?token=${token}`);
  await page.getByRole("button", { name: /verify email/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
