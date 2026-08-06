import { expect, test } from "@playwright/test";

const live = !!process.env.E2E_BASE_URL;

test.describe("public smoke", () => {
  test.skip(!live, "Set E2E_BASE_URL to a running web origin");

  test("home exposes main content landmark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible();
  });

  test("services route stays content-safe", async ({ page }) => {
    await page.goto("/services");
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByText(/brand campaign|comedy performance/i)).toHaveCount(0);
  });
});
