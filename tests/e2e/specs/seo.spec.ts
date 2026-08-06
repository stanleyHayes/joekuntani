import { expect, test } from "@playwright/test";

const live = !!process.env.E2E_BASE_URL;

test.describe("SEO surfaces", () => {
  test.skip(!live, "Set E2E_BASE_URL to a running web origin");

  test("robots blocks admin crawling", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body.toLowerCase()).toContain("disallow");
    expect(body).toMatch(/admin/i);
  });

  test("sitemap is well-formed xml when present", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect([200, 404]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.text();
      expect(body).toContain("<urlset");
      expect(body).not.toMatch(/\/admin\//i);
    }
  });
});
