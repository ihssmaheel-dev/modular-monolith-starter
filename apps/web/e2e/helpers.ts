import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { AuthResponse, OrganizationResponse } from "@repo/contracts";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

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
  await page.goto("/register");
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
  await verifyAndEnterWorkspace(page, token);
}

export async function verifyAndEnterWorkspace(page: Page, token: string): Promise<void> {
  await page.goto(`/verify-email?token=${token}`);
  const verified = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/rpc/auth/verify-email"),
  );
  await page.getByRole("button", { name: /verify email/i }).click();
  const response = await verified;
  expect(response.ok()).toBe(true);
  const auth = (await response.json()) as AuthResponse;
  const apiOrigin = new URL(response.url()).origin;
  const cookies = await page.context().cookies(apiOrigin);
  const xsrf = cookies.find((cookie) => cookie.name === "XSRF-TOKEN")?.value ?? "";
  const organization = await page.request.post(`${apiOrigin}/api/v1/rpc/tenancy/organizations`, {
    data: { name: `E2E ${randomUUID()}` },
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "idempotency-key": randomUUID(),
      "x-xsrf-token": xsrf,
    },
  });
  expect(organization.status()).toBe(201);
  const tenant = (await organization.json()) as OrganizationResponse;
  // Verification now shows a success screen; it no longer redirects automatically.
  await expect(page.getByRole("button", { name: /^log in$/i })).toBeVisible();
  await page.evaluate((tenantId) => {
    localStorage.setItem("tenant-storage", JSON.stringify({ state: { tenantId }, version: 0 }));
  }, tenant.id);
  // Enter once with the persisted tenant rehydrated. Clicking the continuation
  // first races its client navigation against this full document navigation.
  const session = page.waitForResponse((result) =>
    new URL(result.url()).pathname.endsWith("/rpc/auth/me"),
  );
  await page.goto("/dashboard");
  expect((await session).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: /switch organization/i })).toHaveText(tenant.name);
}
