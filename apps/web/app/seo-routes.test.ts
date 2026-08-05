import { beforeEach, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  settings: vi.fn(),
  content: vi.fn(),
  bySlug: vi.fn(),
  services: vi.fn(),
  contact: vi.fn(),
  legal: vi.fn(),
  mediaKit: vi.fn(),
  events: vi.fn(),
}));
vi.mock("../lib/settings", () => ({ getPublicSettings: data.settings }));
vi.mock("../components/content/data", () => ({
  getPublicContent: data.content,
  getPublicContentBySlug: data.bySlug,
}));
vi.mock("../components/services/data", () => ({
  getPublicServices: data.services,
}));
vi.mock("../components/public-info/data", () => ({
  getContactConfiguration: data.contact,
  getLegalSurface: data.legal,
  getMediaKit: data.mediaKit,
}));
vi.mock("../components/events/data", () => ({ getPublicEvents: data.events }));

import robots from "./robots";
import sitemap from "./sitemap";

beforeEach(() => {
  vi.clearAllMocks();
  data.settings.mockResolvedValue({
    seo: { canonical_base: "https://example.test" },
  });
  data.content.mockResolvedValue([]);
  data.bySlug.mockResolvedValue(null);
  data.services.mockResolvedValue([]);
  data.contact.mockResolvedValue(null);
  data.legal.mockResolvedValue({ page: null });
  data.mediaKit.mockResolvedValue({ page: null, download: null });
  data.events.mockResolvedValue({ state: "ready", data: [] });
});

it("blocks admin/API crawling and advertises the canonical sitemap", async () => {
  await expect(robots()).resolves.toEqual({
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }],
    sitemap: "https://example.test/sitemap.xml",
  });
});

it("omits unavailable publication-gated routes from the sitemap", async () => {
  const urls = (await sitemap()).map((entry) => entry.url);
  expect(urls).toEqual(["https://example.test/book"]);
  expect(urls).not.toContain("https://example.test/privacy");
  expect(urls).not.toContain("https://example.test/contact");
});

it("fails closed without a valid HTTPS canonical origin", async () => {
  data.settings.mockResolvedValue({
    seo: { canonical_base: "http://example.test" },
  });
  await expect(sitemap()).resolves.toEqual([]);
  await expect(robots()).resolves.toMatchObject({ sitemap: undefined });
});

it("includes only available dynamic and publication-gated routes", async () => {
  data.bySlug.mockImplementation(async (_kind: string, slug: string) =>
    slug === "home" || slug === "about"
      ? { slug, updated_at: "2026-08-05T00:00:00Z" }
      : null,
  );
  data.content.mockResolvedValue([
    { slug: "approved-work", updated_at: "2026-08-05T00:00:00Z" },
    { slug: "", updated_at: "2026-08-05T00:00:00Z" },
  ]);
  data.services.mockResolvedValue([{ id: "service" }]);
  data.contact.mockResolvedValue({ consent: { version: "v1" } });
  data.legal.mockResolvedValue({ page: { id: "legal" } });
  data.mediaKit.mockResolvedValue({
    page: { id: "media-kit" },
    download: { href: "https://cdn.example.test/kit.pdf" },
  });
  data.events.mockResolvedValue({
    state: "ready",
    data: [
      {
        slug: "approved-event",
        starts_at: "2026-09-05T00:00:00Z",
      },
    ],
  });
  const urls = (await sitemap()).map((entry) => entry.url);
  expect(urls).toEqual(
    expect.arrayContaining([
      "https://example.test/",
      "https://example.test/about",
      "https://example.test/services",
      "https://example.test/contact",
      "https://example.test/privacy",
      "https://example.test/terms",
      "https://example.test/media-kit",
      "https://example.test/work/approved-work",
      "https://example.test/events",
      "https://example.test/events/approved-event",
    ]),
  );
});
