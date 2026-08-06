import { expect, test } from "@playwright/test";

const live = !!process.env.E2E_BASE_URL;

test.describe("enquiry journey", () => {
  test.skip(!live, "Set E2E_BASE_URL to a running web origin");

  test("book route renders enquiry surface", async ({ page }) => {
    await page.goto("/book");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /enquiry|service|awaiting/i }),
    ).toBeVisible();
  });});
