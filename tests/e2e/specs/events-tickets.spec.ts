import { expect, test } from "@playwright/test";

const live = !!process.env.E2E_BASE_URL;

test.describe("events and ticketing", () => {
  test.skip(!live, "Set E2E_BASE_URL + seeded event fixtures");

  test("events index loads", async ({ page }) => {
    await page.goto("/events");
    await expect(page.locator("#main-content")).toBeVisible();
  });

  test.fix("checkout hold → webhook paid → confirmation", async () => {
    // Requires API webhook signer, seeded event inventory, and Resend sandbox.
  });

  test.fix("sold-out and payment-failure release inventory", async () => {
    // Concurrent hold + failure release assertions against admin inventory.
  });
});
