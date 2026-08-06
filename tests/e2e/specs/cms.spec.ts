import { test } from "@playwright/test";

const live = !!process.env.E2E_BASE_URL && !!process.env.E2E_ADMIN_EMAIL;

test.describe("CMS publish without deploy", () => {
  test.skip(!live, "Requires staging admin session + content_editor role");

  test.fix("published CMS page appears on public route after cache invalidate", async () => {
    // Drive /admin/content publish then assert public body text from approved fixture only.
  });
});
