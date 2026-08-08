import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { event } from "../../../components/events/test-fixture";
import type { PublicTicketType } from "../../../components/events/types";

const mocks = vi.hoisted(() => ({ event: vi.fn(), settings: vi.fn() }));
vi.mock("../../../components/events/data", () => ({
  getPublicEvent: mocks.event,
}));
vi.mock("../../../lib/settings", () => ({ getPublicSettings: mocks.settings }));

import EventDetailPage, { generateMetadata } from "./page";

const DEMO_SLUG = "accra-delivery-night-demo";

const ticket = (extra: Partial<PublicTicketType> = {}): PublicTicketType => ({
  id: crypto.randomUUID(),
  name: "Approved ticket",
  description: "Approved ticket details",
  price: "100.00",
  currency: "GHS",
  capacity: 100,
  sold: 20,
  reserved: 5,
  min_per_order: 1,
  max_per_order: 4,
  sales_start: "2026-08-01T00:00:00Z",
  sales_end: "2026-08-10T17:00:00Z",
  availability: "on_sale",
  checkout_href: "/tickets/checkout?event=approved-event",
  ...extra,
});

const ldScript = (container: HTMLElement) =>
  container.querySelector('script[type="application/ld+json"]');

const renderPage = async (slug: string) =>
  render(await EventDetailPage({ params: Promise.resolve({ slug }) }));

beforeEach(() => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  // Every social-image lookup misses, so metadata resolves without the network.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
  );
  mocks.settings.mockResolvedValue({
    seo: { canonical_base: "https://example.test", social_image_asset_id: "" },
  });
  mocks.event.mockResolvedValue({ state: "ready", data: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// A slug that resolves to nothing must render a soft 404 body and must not
// describe a non-existent event to crawlers via JSON-LD.
it("renders a polite soft 404 when the event is not published", async () => {
  const { container } = await renderPage("ghost-event");

  expect(
    screen.getByRole("heading", { name: "Event unavailable" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "This event is not published or does not exist.",
  );
  expect(ldScript(container)).toBeNull();
});

// An upstream outage and an unpublished slug are different facts. The outage
// has to be assertive (role="alert"), and it must never tell a visitor that a
// date they hold tickets for does not exist.
it("escalates a data-layer error to an assertive alert", async () => {
  mocks.event.mockResolvedValue({ state: "error", data: null });

  await renderPage("approved-event");

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Published event information could not be loaded.",
  );
  expect(screen.queryByText(/does not exist/)).toBeNull();
});

// The demo fallback must be visibly labelled and, more importantly, must emit
// no structured data: placeholder inventory that says "not a confirmed date"
// cannot be published to search engines as a real, ticketed event.
it("falls back to demo inventory without publishing it as structured data", async () => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_CONTENT", "1");

  const { container } = await renderPage(DEMO_SLUG);

  expect(
    screen.getByRole("heading", { name: /Delivery Night — Accra/ }),
  ).toBeVisible();
  expect(screen.getByText("Demo event")).toBeVisible();
  expect(screen.getByText(/Demo preview/)).toBeVisible();
  // Covers are keyed by slug; a lookup keyed off anything else drops silently.
  expect(
    container.querySelector('img[src="/demo/work-crowd.png"]'),
  ).not.toBeNull();
  expect(screen.getByText("Demo media — replace via CMS")).toBeVisible();
  expect(ldScript(container)).toBeNull();
});

// The fallback is a slug lookup. If it ever degraded to "the first demo event",
// an unknown URL would render someone else's date as if it were this one.
it("does not substitute a demo event for an unknown slug", async () => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_CONTENT", "1");

  const { container } = await renderPage("no-such-event");

  expect(
    screen.getByRole("heading", { name: "Event unavailable" }),
  ).toBeVisible();
  expect(screen.queryByText(/Demo preview/)).toBeNull();
  expect(container.querySelector('img[src^="/demo/"]')).toBeNull();
});

// Precedence: with the demo flag on AND a published event at the same slug, the
// approved record wins. Inverting the fallback would serve placeholder copy over
// real on-sale inventory on a demo-flagged deployment.
it("prefers published inventory over the demo fixture at the same slug", async () => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_CONTENT", "1");
  mocks.event.mockResolvedValue({
    state: "ready",
    data: event({ slug: DEMO_SLUG, title: "Approved Accra date" }),
  });

  const { container } = await renderPage(DEMO_SLUG);

  expect(
    screen.getByRole("heading", { name: "Approved Accra date" }),
  ).toBeVisible();
  expect(screen.getByText("Live event")).toBeVisible();
  expect(screen.queryByText(/Demo preview/)).toBeNull();
  expect(container.querySelector('img[src^="/demo/"]')).toBeNull();
  expect(ldScript(container)).not.toBeNull();
});

// schema.org needs an absolute URL. With no published canonical base the block
// has to be dropped entirely rather than emitted with a missing or relative url.
it("omits structured data when no canonical base is published", async () => {
  mocks.settings.mockResolvedValue(null);
  mocks.event.mockResolvedValue({ state: "ready", data: event() });

  const { container } = await renderPage("approved-event");

  expect(screen.getByRole("heading", { name: "Approved event" })).toBeVisible();
  expect(ldScript(container)).toBeNull();
});

// Per-tier offers: a tier with no checkout link must fall back to the page URL
// rather than emitting an undefined one, and a sold-out tier must never be
// advertised as InStock.
it("maps each ticket tier onto an offer with its own checkout URL", async () => {
  mocks.event.mockResolvedValue({
    state: "ready",
    data: event({
      tickets: [
        ticket({ name: "General" }),
        ticket({
          name: "Guest pass",
          availability: "sold_out",
          checkout_href: undefined,
        }),
        ticket({
          name: "Early bird",
          availability: "scheduled",
          checkout_href: undefined,
        }),
      ],
    }),
  });

  const { container } = await renderPage("approved-event");
  const payload = JSON.parse(ldScript(container)?.textContent ?? "");

  expect(payload.url).toBe("https://example.test/events/approved-event");
  expect(payload.location).toMatchObject({
    name: "Approved venue",
    address: { addressLocality: "Accra", addressCountry: "GH" },
  });
  expect(payload.offers).toEqual([
    expect.objectContaining({
      name: "General",
      price: "100.00",
      priceCurrency: "GHS",
      url: "https://example.test/tickets/checkout?event=approved-event",
      availability: "https://schema.org/InStock",
    }),
    expect.objectContaining({
      name: "Guest pass",
      url: "https://example.test/events/approved-event",
      availability: "https://schema.org/SoldOut",
    }),
    expect.objectContaining({
      name: "Early bird",
      url: "https://example.test/events/approved-event",
      availability: "https://schema.org/PreOrder",
    }),
  ]);
});

// The payload goes out through dangerouslySetInnerHTML, so CMS-authored text
// containing "</script>" must not be able to close the block and inject markup.
it("escapes angle brackets in CMS text before inlining the JSON-LD", async () => {
  mocks.event.mockResolvedValue({
    state: "ready",
    data: event({ title: "</script><img src=x onerror=alert(1)>" }),
  });

  const { container } = await renderPage("approved-event");
  const raw = ldScript(container)?.textContent ?? "";

  expect(raw).not.toContain("</script>");
  expect(raw).toContain("\\u003c/script");
  expect(container.querySelectorAll("script")).toHaveLength(1);
  expect(JSON.parse(raw).name).toBe("</script><img src=x onerror=alert(1)>");
});

// A 200 that renders "Event unavailable" still gets indexed unless the head says
// otherwise, so both the missing and the errored branch have to be noindex.
it("marks unavailable and errored events noindex", async () => {
  await expect(
    generateMetadata({ params: Promise.resolve({ slug: "ghost-event" }) }),
  ).resolves.toMatchObject({
    title: "Event unavailable",
    robots: { index: false, follow: false },
  });

  mocks.event.mockResolvedValue({ state: "error", data: null });
  await expect(
    generateMetadata({ params: Promise.resolve({ slug: "approved-event" }) }),
  ).resolves.toMatchObject({ robots: { index: false, follow: false } });
});

// generateMetadata carries its own copy of the demo fallback. If it drifts from
// the body's, a rendered demo event ships with an "Event unavailable" title.
it("titles the demo fallback from the demo fixture", async () => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_CONTENT", "1");

  const metadata = await generateMetadata({
    params: Promise.resolve({ slug: DEMO_SLUG }),
  });

  expect(metadata.title).toBe("Delivery Night — Accra (demo)");
  expect(metadata.description).toContain("Demo ticketed comedy-with-guitar");
  expect(metadata.alternates?.canonical).toBe(
    `https://example.test/events/${DEMO_SLUG}`,
  );
});
