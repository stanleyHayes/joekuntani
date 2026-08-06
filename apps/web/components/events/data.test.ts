import { afterEach, expect, it, vi } from "vitest";
import { activeFeaturedEvent, getPublicEvent, getPublicEvents } from "./data";
import { event } from "./test-fixture";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("loads, validates and orders only safe public events", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  const later = event({
    id: crypto.randomUUID(),
    slug: "later",
    starts_at: "2026-08-11T18:00:00Z",
    ends_at: "2026-08-11T21:00:00Z",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            later,
            event(),
            event({
              venue: { ...event().venue, map_url: "http://unsafe.test" },
            }),
          ],
        }),
      ),
    ),
  );
  await expect(getPublicEvents()).resolves.toMatchObject({
    state: "ready",
    data: [{ slug: "approved-event" }, { slug: "later" }],
  });
});

it("fails closed for unavailable list and unsafe detail checkout", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(getPublicEvents()).resolves.toEqual({
    state: "error",
    data: [],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          event({
            tickets: [
              {
                ...event().tickets[0],
                checkout_href: "https://evil.test",
              },
            ],
          }),
        ),
      ),
    ),
  );
  await expect(getPublicEvent("approved-event")).resolves.toEqual({
    state: "ready",
    data: null,
  });
});

it("shows a featured banner only inside its approved schedule", () => {
  const approved = event();
  expect(
    activeFeaturedEvent([approved], new Date("2026-08-05T12:00:00Z"))?.slug,
  ).toBe("approved-event");
  expect(
    activeFeaturedEvent([approved], new Date("2026-08-10T12:00:00Z")),
  ).toBeUndefined();
  expect(
    activeFeaturedEvent(
      [event({ banner: { featured: false } })],
      new Date("2026-08-05T12:00:00Z"),
    ),
  ).toBeUndefined();
});

it("distinguishes a missing detail from a valid published detail", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(event())));
  vi.stubGlobal("fetch", fetcher);
  await expect(getPublicEvent("missing")).resolves.toEqual({
    state: "ready",
    data: null,
  });
  await expect(getPublicEvent("approved-event")).resolves.toMatchObject({
    state: "ready",
    data: { slug: "approved-event" },
  });
});

it("fails closed for missing configuration, invalid slugs and non-success responses", async () => {
  vi.unstubAllEnvs();
  delete process.env.API_BASE_URL;
  await expect(getPublicEvents()).resolves.toEqual({
    state: "error",
    data: [],
  });
  await expect(getPublicEvent("Not Safe")).resolves.toEqual({
    state: "error",
    data: null,
  });
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  await expect(getPublicEvents()).resolves.toEqual({
    state: "error",
    data: [],
  });
  await expect(getPublicEvent("approved-event")).resolves.toEqual({
    state: "error",
    data: null,
  });
});

it("accepts an empty successful list and safe optional-free records", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  const minimal = event({
    venue: {
      name: "Venue",
      address: "Address",
      city: "Kumasi",
      country_code: "GH",
    },
    policies: { refunds: "Refunds", entry: "Entry", age_limit: 0 },
    banner: { featured: false },
    tickets: [],
    availability: "scheduled",
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: "invalid" })))
    .mockResolvedValueOnce(new Response(JSON.stringify(minimal)));
  vi.stubGlobal("fetch", fetcher);
  await expect(getPublicEvents()).resolves.toEqual({
    state: "ready",
    data: [],
  });
  await expect(getPublicEvent("approved-event")).resolves.toMatchObject({
    data: { venue: { city: "Kumasi" }, tickets: [] },
  });
});

it.each([
  ["event id", () => event({ id: "not-a-uuid" })],
  [
    "banner UUID version",
    () => event({ banner_asset_id: "123e4567-e89b-12d3-a456-426614174000" }),
  ],
  [
    "ticket id",
    () => event({ tickets: [{ ...event().tickets[0], id: "bad" }] }),
  ],
  [
    "currency",
    () => event({ tickets: [{ ...event().tickets[0], currency: "ZZZ" }] }),
  ],
  [
    "zero capacity",
    () => event({ tickets: [{ ...event().tickets[0], capacity: 0 }] }),
  ],
  [
    "zero minimum",
    () => event({ tickets: [{ ...event().tickets[0], min_per_order: 0 }] }),
  ],
  [
    "inverted limits",
    () =>
      event({
        tickets: [
          { ...event().tickets[0], min_per_order: 5, max_per_order: 4 },
        ],
      }),
  ],
  [
    "limit over capacity",
    () => event({ tickets: [{ ...event().tickets[0], max_per_order: 101 }] }),
  ],
  [
    "oversubscribed",
    () =>
      event({ tickets: [{ ...event().tickets[0], sold: 98, reserved: 3 }] }),
  ],
  [
    "inverted sales",
    () =>
      event({
        tickets: [
          {
            ...event().tickets[0],
            sales_start: "2026-08-10T18:00:00Z",
            sales_end: "2026-08-01T00:00:00Z",
          },
        ],
      }),
  ],
] as const)("rejects contract-invalid %s", async (_label, invalid) => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(invalid()))),
  );
  await expect(getPublicEvent("approved-event")).resolves.toEqual({
    state: "ready",
    data: null,
  });
});
