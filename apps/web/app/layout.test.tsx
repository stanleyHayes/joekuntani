import { afterEach, expect, it, vi } from "vitest";
import { generateMetadata } from "./layout";

afterEach(() => {
  delete process.env.API_BASE_URL;
  vi.unstubAllGlobals();
});
it("uses only published settings for global SEO with an approval-safe fallback", async () => {
  await expect(generateMetadata()).resolves.toEqual(
    expect.objectContaining({
      description: "Official website content is awaiting approval.",
    }),
  );
  process.env.API_BASE_URL = "http://api.test";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          navigation: [],
          footer: [],
          ctas: [],
          contact: {},
          social: [],
          brand: { name: "Approved brand" },
          seo: {
            default_title: "Approved title",
            title_template: "%s / Approved",
            description: "Approved description",
            canonical_base: "https://example.test",
          },
          consent: {},
        }),
        { status: 200 },
      ),
    ),
  );
  await expect(generateMetadata()).resolves.toEqual(
    expect.objectContaining({
      description: "Approved description",
      metadataBase: new URL("https://example.test"),
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          navigation: [],
          footer: [],
          ctas: [],
          contact: {},
          social: [],
          brand: { name: "Approved brand" },
          seo: {
            default_title: "",
            title_template: "",
            description: "",
            canonical_base: "",
          },
          consent: {},
        }),
        { status: 200 },
      ),
    ),
  );
  await expect(generateMetadata()).resolves.toEqual(
    expect.objectContaining({
      description: undefined,
      metadataBase: undefined,
    }),
  );
});
