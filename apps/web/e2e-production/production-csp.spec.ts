import { expect, test } from "@playwright/test";

test("built HTML uses a matching per-response CSP nonce", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const first = await request.get("/");
  const second = await request.get("/");
  expect(first.ok()).toBe(true);
  const firstPolicy = first.headers()["content-security-policy"];
  const secondPolicy = second.headers()["content-security-policy"];
  expect(firstPolicy).toMatch(/script-src 'self' 'nonce-[a-f0-9]{32}' 'strict-dynamic'/);
  expect(secondPolicy).not.toBe(firstPolicy);

  await page.goto("/");
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').count();
  expect(policy).toBe(0);
  // Browsers intentionally conceal CSP nonces from getAttribute(). The standard
  // HTMLScriptElement.nonce property exposes the effective value for verification.
  const themeNonce = await page
    .locator("head script")
    .first()
    .evaluate((element: HTMLScriptElement) => element.nonce);
  expect(themeNonce).toMatch(/^[a-f0-9]{32}$/);
  expect(consoleErrors.filter((message) => message.includes("hydrated"))).toEqual([]);
});
