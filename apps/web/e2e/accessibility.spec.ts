import { expect, test } from "@playwright/test";

test("authentication shell has named controls and valid document structure", async ({ page }) => {
  await page.goto("/auth");

  await expect(page.locator("html")).toHaveAttribute("lang", /^(en|es|fr)$/);
  await expect(page.getByRole("tab", { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /sign up|register/i })).toBeVisible();
  expect(await page.locator("input:not([type=hidden])").count()).toBeGreaterThan(0);
  expect(await page.locator("input:not([type=hidden])").evaluateAll(unnamedControls)).toEqual([]);
  expect(await page.locator("[id]").evaluateAll(duplicateIds)).toEqual([]);
});

function unnamedControls(elements: Element[]): string[] {
  return elements
    .filter((element) => {
      const id = element.getAttribute("id");
      const hasLabel = id
        ? Boolean(document.querySelector(`label[for="${CSS.escape(id)}"]`))
        : false;
      return (
        !hasLabel && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby")
      );
    })
    .map((element) => element.outerHTML);
}

function duplicateIds(elements: Element[]): string[] {
  const ids = elements.map((element) => element.id);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}
