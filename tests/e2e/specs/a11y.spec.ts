import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const live = !!process.env.E2E_BASE_URL;

test.describe("axe smoke", () => {
  test.skip(!live, "Set E2E_BASE_URL to a running web origin");

  for (const path of ["/", "/services", "/book", "/events"]) {
    test(`no serious/critical axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      const blockers = results.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact || ""),
      );
      expect(blockers, JSON.stringify(blockers, null, 2)).toEqual([]);
    });
  }
});
