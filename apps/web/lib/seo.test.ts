import { afterEach, expect, it, vi } from "vitest";
import { canonicalURL, contentMetadata, jsonLd, pageMetadata } from "./seo";
import type { ContentItem } from "../components/content/types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("accepts only same-origin HTTPS canonical URLs", () => {
  expect(canonicalURL("/work/one", "https://example.test")).toBe(
    "https://example.test/work/one",
  );
  expect(
    canonicalURL("https://evil.test/work/one", "https://example.test"),
  ).toBeUndefined();
  expect(canonicalURL("/work/one", "http://example.test")).toBeUndefined();
  expect(canonicalURL("/work/one", "not-a-url")).toBeUndefined();
  expect(
    canonicalURL("/work/one", "https://user:secret@example.test"),
  ).toBeUndefined();
  expect(
    canonicalURL("https://user:secret@example.test/work/one", "https://example.test"),
  ).toBeUndefined();
  expect(canonicalURL("/work/one")).toBeUndefined();
});

it("fails closed when social-image fetches error or return non-OK", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/settings")) {
        return Response.json({
          seo: { canonical_base: "https://example.test", social_image_asset_id: "asset-1" },
        });
      }
      return new Response(null, { status: 503 });
    }),
  );
  await expect(
    pageMetadata({ title: "Page", description: "Description", path: "/page" }),
  ).resolves.toMatchObject({ openGraph: { images: [{ url: "/og" }] } });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/settings")) {
        return Response.json({
          seo: { canonical_base: "https://example.test", social_image_asset_id: "asset-1" },
        });
      }
      throw new Error("network down");
    }),
  );
  await expect(
    pageMetadata({ title: "Page", description: "Description", path: "/page" }),
  ).resolves.toMatchObject({ openGraph: { images: [{ url: "/og" }] } });
});

it("builds canonical global page metadata without an unapproved image", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/settings"))
        return Response.json({
          seo: {
            canonical_base: "https://example.test",
            social_image_asset_id: "asset-unsafe",
          },
        });
      return Response.json({
        public_url: "http://cdn.example.test/unsafe.jpg",
        status: "processing",
        mime_type: "image/jpeg",
      });
    }),
  );
  await expect(
    pageMetadata({
      title: "Page",
      description: "Description",
      path: "/page",
    }),
  ).resolves.toMatchObject({
    alternates: { canonical: "https://example.test/page" },
    // The unapproved asset is still refused; the generated card stands in.
    openGraph: { images: [{ url: "/og" }] },
  });
});

it.each([
  ["processing", "image/jpeg", "https://cdn.example.test/event.jpg"],
  ["ready", "application/pdf", "https://cdn.example.test/event.pdf"],
  ["ready", "image/jpeg", "http://cdn.example.test/event.jpg"],
  ["ready", "image/jpeg", "https://user:secret@cdn.example.test/event.jpg"],
  ["ready", "image/jpeg", "not-a-url"],
] as const)(
  "rejects an unapproved event asset and falls back to the approved global image",
  async (status, mime_type, public_url) => {
    vi.stubEnv("API_BASE_URL", "https://api.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/settings"))
          return Response.json({
            seo: {
              canonical_base: "https://example.test",
              social_image_asset_id: "global-ready",
            },
          });
        if (url.endsWith("/event-asset"))
          return Response.json({ status, mime_type, public_url });
        return Response.json({
          status: "ready",
          mime_type: "image/png",
          public_url: "https://cdn.example.test/global.png",
        });
      }),
    );
    await expect(
      pageMetadata({
        title: "Event",
        description: "Approved event",
        path: "/events/approved",
        socialImageAssetID: "event-asset",
      }),
    ).resolves.toMatchObject({
      openGraph: {
        images: [{ url: "https://cdn.example.test/global.png" }],
      },
    });
  },
);

it("escapes structured data markup breakout characters", () => {
  expect(jsonLd({ name: "</script>" })).not.toContain("</script>");
});

// Policy change, deliberate: a null item used to emit noindex. It cannot be
// told apart from a failed lookup — and the content fetch times out after 2s —
// so one slow API response de-indexed live pages, which search engines honour
// aggressively and reverse slowly. Indexing a soft-404 placeholder is the
// cheaper mistake. Routes that truly do not exist call notFound(); pages that
// must never be indexed set robots explicitly.
it("does not de-index when content cannot be resolved", async () => {
  const metadata = await contentMetadata(null, {
    title: "Unavailable",
    description: "Not published",
    path: "/missing",
  });
  expect(metadata.robots).toBeUndefined();
  expect(metadata.title).toBe("Unavailable");
});

it("uses approved content metadata and a ready image", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/settings"))
        return new Response(
          JSON.stringify({
            seo: { canonical_base: "https://example.test" },
          }),
        );
      return new Response(
        JSON.stringify({
          public_url: "https://cdn.example.test/approved.jpg",
          status: "ready",
          mime_type: "image/jpeg",
        }),
      );
    }),
  );
  const item = {
    title: "Approved title",
    summary: "Approved summary",
    seo: {
      title: "SEO title",
      description: "SEO description",
      canonical_url: "/work/approved",
      social_image_asset_id: "asset-1",
    },
  } as ContentItem;
  await expect(
    contentMetadata(item, {
      title: "Fallback",
      description: "Fallback",
      path: "/work/approved",
    }),
  ).resolves.toMatchObject({
    title: "SEO title",
    alternates: { canonical: "https://example.test/work/approved" },
    openGraph: {
      images: [{ url: "https://cdn.example.test/approved.jpg" }],
    },
  });
});
