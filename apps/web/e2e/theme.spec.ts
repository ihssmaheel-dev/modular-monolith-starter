import { test, expect } from "@playwright/test";

test.describe("theme", () => {
  test("d key toggles between light and dark themes", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains("light") ||
        document.documentElement.classList.contains("dark"),
    );
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
    await page.locator("body").click({ position: { x: 0, y: 0 } });
    const before = await readTheme(page);
    await page.keyboard.press("d");
    await expect.poll(() => readTheme(page)).not.toEqual(before);
    const after = await readTheme(page);
    expect(after.theme).not.toBe(before.theme);
    expect(after.background).not.toBe(before.background);
  });
});

async function readTheme(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    background: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
  }));
}
