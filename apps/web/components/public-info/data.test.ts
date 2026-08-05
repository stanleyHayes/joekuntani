import { afterEach, expect, it, vi } from "vitest";
import { getContactConfiguration, getLegalSurface, getMediaKit } from "./data";

const item = (kind: "page" | "press", extra: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  revision: 1,
  kind,
  title: "Approved",
  summary: "Approved summary",
  body: "Approved body",
  category: "",
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
  ...extra,
});
const settings = {
  navigation: [],
  footer: [],
  ctas: [],
  contact: { public_email: "approved@example.test", phone: "", location: "" },
  social: [],
  brand: {
    name: "Joe Kuntani",
    tagline: "",
    logo_asset_id: "",
    favicon_asset_id: "",
  },
  seo: {
    title_template: "",
    default_title: "",
    description: "",
    canonical_base: "",
    social_image_asset_id: "",
  },
  consent: {
    version: "approved-v1",
    privacy_label: "Approved consent",
    marketing_label: "",
    privacy_url: "/privacy",
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("exposes only an approved versioned PDF on an allowlisted host", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/page/media-kit"))
        return new Response(
          JSON.stringify(item("page", { slug: "media-kit" })),
        );
      if (url.includes("/media/assets/asset-approved"))
        return new Response(
          JSON.stringify({
            id: "asset-approved",
            public_url: "https://api.example.test/files/kit.pdf",
            mime_type: "application/pdf",
            status: "ready",
            tags: ["use-rights:approved"],
            updated_at: "2026-08-05T00:00:00Z",
          }),
        );
      return new Response(
        JSON.stringify({
          items: [
            item("press", {
              category: "media-kit-pdf",
              tags: ["version:approved-v3"],
              gallery_asset_ids: ["asset-approved"],
            }),
          ],
        }),
      );
    }),
  );
  await expect(getMediaKit()).resolves.toMatchObject({
    download: {
      version: "approved-v3",
      href: "https://api.example.test/files/kit.pdf",
    },
  });
});

it("fails the whole media-kit publication when narrative is missing", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/page/media-kit"))
        return new Response(
          JSON.stringify(item("page", { slug: "media-kit", body: "" })),
        );
      return new Response(
        JSON.stringify({
          items: [
            item("press", {
              tags: ["version:v1"],
              gallery_asset_ids: ["asset-approved"],
            }),
          ],
        }),
      );
    }),
  );
  await expect(getMediaKit()).resolves.toEqual({ page: null, download: null });
});

it("requires every legal subject plus approved version and dates", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  let slug = "privacy";
  let currentTags = [
    "legal-version:v2",
    "effective-date:2026-08-01",
    "subject:purposes-data-use",
    "subject:lawful-basis",
    "subject:retention",
    "subject:cookies",
    "subject:enquiries",
    "subject:data-subject-rights",
    "subject:contact",
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/settings"))
        return new Response(JSON.stringify(settings));
      return new Response(
        JSON.stringify(item("page", { slug, tags: currentTags })),
      );
    }),
  );
  await expect(getLegalSurface("privacy")).resolves.toMatchObject({
    page: { slug: "privacy" },
    publication: {
      version: "v2",
      effectiveDate: "2026-08-01",
      updatedAt: "2026-08-05T00:00:00Z",
    },
  });
  for (const required of [
    "legal-version:v2",
    "effective-date:2026-08-01",
    "subject:purposes-data-use",
    "subject:lawful-basis",
    "subject:retention",
    "subject:cookies",
    "subject:enquiries",
    "subject:data-subject-rights",
    "subject:contact",
  ]) {
    const complete = currentTags;
    currentTags = complete.filter((tag) => tag !== required);
    await expect(getLegalSurface("privacy")).resolves.toMatchObject({
      page: null,
      publication: null,
    });
    currentTags = complete;
  }

  slug = "terms";
  currentTags = [
    "legal-version:v3",
    "effective-date:2026-08-02",
    "subject:site-use",
    "subject:asset-use",
    "subject:booking-disclaimer",
    "subject:contact",
  ];
  await expect(getLegalSurface("terms")).resolves.toMatchObject({
    page: { slug: "terms" },
    publication: { version: "v3", effectiveDate: "2026-08-02" },
  });
  for (const required of [...currentTags]) {
    const complete = currentTags;
    currentTags = complete.filter((tag) => tag !== required);
    await expect(getLegalSurface("terms")).resolves.toMatchObject({
      page: null,
      publication: null,
    });
    currentTags = complete;
  }

  slug = "privacy";
  const validPrivacyTags = [
    "legal-version:v2",
    "subject:purposes-data-use",
    "subject:lawful-basis",
    "subject:retention",
    "subject:cookies",
    "subject:enquiries",
    "subject:data-subject-rights",
    "subject:contact",
  ];
  for (const invalidDate of [
    "2026-02-29",
    "2026-02-31",
    "2026-13-01",
    "2026-00-10",
    "9999-01-01",
  ]) {
    currentTags = [...validPrivacyTags, `effective-date:${invalidDate}`];
    await expect(getLegalSurface("privacy")).resolves.toMatchObject({
      page: null,
      publication: null,
    });
  }
  currentTags = [...validPrivacyTags, "effective-date:2024-02-29"];
  await expect(getLegalSurface("privacy")).resolves.toMatchObject({
    publication: { effectiveDate: "2024-02-29" },
  });
});

it("fails closed for unapproved hosts and incomplete legal/contact settings", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/settings"))
        return new Response(
          JSON.stringify({
            ...settings,
            contact: { public_email: "", phone: "", location: "" },
            consent: { ...settings.consent, privacy_url: "" },
          }),
        );
      if (url.includes("/press?"))
        return new Response(
          JSON.stringify({
            items: [
              item("press", {
                category: "media-kit-pdf",
                external_url: "https://unapproved.example/kit.pdf",
                tags: ["version:v1"],
              }),
            ],
          }),
        );
      return new Response(JSON.stringify(item("page", { slug: "privacy" })));
    }),
  );
  expect((await getMediaKit()).download).toBeNull();
  expect((await getLegalSurface("privacy")).page).toBeNull();
  await expect(getContactConfiguration()).resolves.toBeNull();
});
