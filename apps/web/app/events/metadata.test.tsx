import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { event } from "../../components/events/test-fixture";

const mocks = vi.hoisted(() => ({
  events: vi.fn(),
  event: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("../../components/events/data", () => ({
  getPublicEvents: mocks.events,
  getPublicEvent: mocks.event,
}));
vi.mock("../../lib/settings", () => ({ getPublicSettings: mocks.settings }));

import { generateMetadata as listMetadata } from "./page";
import EventDetailPage, {
  generateMetadata as detailMetadata,
} from "./[slug]/page";

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        public_url: "https://cdn.example.test/event.jpg",
        status: "ready",
        mime_type: "image/jpeg",
      }),
    ),
  );
  mocks.settings.mockResolvedValue({
    seo: { canonical_base: "https://example.test", social_image_asset_id: "" },
  });
  mocks.events.mockResolvedValue({ state: "ready", data: [event()] });
  mocks.event.mockResolvedValue({
    state: "ready",
    data: event({
      banner_asset_id: "123e4567-e89b-42d3-a456-426614174000",
    }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("emits canonical Open Graph metadata only for available events", async () => {
  await expect(listMetadata()).resolves.toMatchObject({
    alternates: { canonical: "https://example.test/events" },
    openGraph: { url: "https://example.test/events" },
  });
  await expect(
    detailMetadata({ params: Promise.resolve({ slug: "approved-event" }) }),
  ).resolves.toMatchObject({
    alternates: { canonical: "https://example.test/events/approved-event" },
    openGraph: {
      images: [{ url: "https://cdn.example.test/event.jpg" }],
    },
  });
  mocks.events.mockResolvedValue({ state: "ready", data: [] });
  await expect(listMetadata()).resolves.toMatchObject({
    robots: { index: false, follow: false },
  });
});

it("renders escaped Event structured data with offers", async () => {
  const { container } = render(
    await EventDetailPage({
      params: Promise.resolve({ slug: "approved-event" }),
    }),
  );
  const value = container.querySelector(
    'script[type="application/ld+json"]',
  )?.textContent;
  expect(value).toContain('"@type":"Event"');
  expect(value).toContain('"@type":"Offer"');
  expect(value).toContain("https://example.test/events/approved-event");
});
