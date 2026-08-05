import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicContent, getPublicContentBySlug } from "./data";
import type { ContentItem, ContentKind } from "./types";

function item(
  kind: ContentKind,
  overrides: Partial<ContentItem> = {},
): ContentItem {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    revision: 1,
    kind,
    title: "Approved title",
    summary: "Approved summary",
    tags: [],
    featured: false,
    gallery_asset_ids: [],
    results: [],
    seo: {
      title: "",
      description: "",
      canonical_url: "",
      social_image_asset_id: "",
    },
    status: "published",
    approved: true,
    created_at: "2026-08-05T00:00:00Z",
    updated_at: "2026-08-05T00:00:00Z",
    ...overrides,
  };
}
afterEach(() => {
  delete process.env.API_BASE_URL;
  vi.restoreAllMocks();
});

describe("public content data", () => {
  it("builds encoded filters and accepts only approved public records", async () => {
    process.env.API_BASE_URL = "https://api.example.test";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            item("portfolio"),
            item("portfolio", { id: "draft", status: "draft" }),
            item("video"),
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await getPublicContent(
      "portfolio",
      { category: "Live arts", tag: "Accra & Ghana", featured: true },
      fetcher,
    );
    expect(result).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/api/public/content/portfolio?category=Live+arts&tag=Accra+%26+Ghana&featured=true",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
  it("loads a safe slug detail and fails closed for invalid, missing or offline data", async () => {
    process.env.API_BASE_URL = "https://api.example.test";
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(item("portfolio", { slug: "approved-work" })),
          { status: 200 },
        ),
      );
    expect(
      (await getPublicContentBySlug("portfolio", "approved-work", fetcher))
        ?.title,
    ).toBe("Approved title");
    expect(
      await getPublicContentBySlug("portfolio", "../private", fetcher),
    ).toBeNull();
    expect(
      await getPublicContent(
        "press",
        {},
        vi.fn().mockRejectedValue(new Error("secret")),
      ),
    ).toEqual([]);
    delete process.env.API_BASE_URL;
    expect(await getPublicContent("page")).toEqual([]);
  });
  it("accepts due scheduled records returned by the server", async () => {
    process.env.API_BASE_URL = "https://api.example.test";
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [item("page", { status: "scheduled" })] }),
          { status: 200 },
        ),
      );
    expect(await getPublicContent("page", {}, fetcher)).toHaveLength(1);
  });
});
