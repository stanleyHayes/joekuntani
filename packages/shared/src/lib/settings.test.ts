import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicSettings, type PublicSettings } from "./settings";

const published: PublicSettings = {
  navigation: [{ label: "Approved work", href: "/work" }],
  footer: [{ label: "Privacy", href: "/privacy" }],
  ctas: [],
  contact: { public_email: "", phone: "", location: "" },
  social: [],
  brand: {
    name: "Approved name",
    tagline: "Approved tagline",
    logo_asset_id: "",
    favicon_asset_id: "",
  },
  seo: {
    title_template: "%s",
    default_title: "Approved",
    description: "Approved description",
    canonical_base: "https://example.test",
    social_image_asset_id: "",
  },
  consent: {
    version: "v1",
    privacy_label: "Approved privacy copy",
    marketing_label: "",
    privacy_url: "/privacy",
  },
};

describe("getPublicSettings", () => {
  const original = process.env.API_BASE_URL;
  afterEach(() => {
    process.env.API_BASE_URL = original;
    vi.unstubAllGlobals();
  });
  it("returns only the published public contract", async () => {
    process.env.API_BASE_URL = "http://api.test";
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(published), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(getPublicSettings()).resolves.toEqual(published);
    expect(fetch).toHaveBeenCalledWith(
      "http://api.test/api/public/settings",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
  it("fails safely when configuration is missing or the API has no publication", async () => {
    delete process.env.API_BASE_URL;
    await expect(getPublicSettings()).resolves.toBeNull();
    process.env.API_BASE_URL = "http://api.test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(getPublicSettings()).resolves.toBeNull();
  });
  it("falls back when the API cannot be reached", async () => {
    process.env.API_BASE_URL = "http://api.test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(getPublicSettings()).resolves.toBeNull();
  });
});
