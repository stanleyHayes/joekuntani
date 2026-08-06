import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicServices } from "./data";
import type { PublicService } from "./types";

function service(
  id: string,
  active: boolean,
  sortOrder: number,
  overrides: Partial<PublicService> = {},
): PublicService {
  return {
    id,
    name: `Service ${id}`,
    slug: `service-${id}`,
    summary: "Approved summary",
    description: "",
    category: "Approved category",
    active,
    state: active ? "active" : "inactive",
    version: 1,
    sort_order: sortOrder,
    form_schema: { version: 1, questions: [] },
    cta: { label: "Enquire", href: "/book" },
    created_at: "2026-08-05T00:00:00Z",
    updated_at: "2026-08-05T00:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.API_BASE_URL;
});

describe("getPublicServices", () => {
  it("filters inactive records and orders active records deterministically", async () => {
    process.env.API_BASE_URL = "https://api.example.test";
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            service("later", true, 3),
            service("hidden", false, 0),
            service("first", true, 1),
            service("same-b", true, 2, { name: "B" }),
            service("same-a", true, 2, { name: "A" }),
            service("wrong-cta", true, 0, {
              // Runtime API may send non-/book CTAs; filter must drop them.
              cta: { label: "Elsewhere", href: "/elsewhere" },
            } as unknown as Partial<PublicService>),
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await getPublicServices(fetcher);
    expect(result.map((item) => item.id)).toEqual([
      "first",
      "same-a",
      "same-b",
      "later",
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.test/api/public/services",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed to approved empty content", async () => {
    process.env.API_BASE_URL = "https://api.example.test";
    expect(
      await getPublicServices(vi.fn().mockRejectedValue(new Error("offline"))),
    ).toEqual([]);
    expect(
      await getPublicServices(
        vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
      ),
    ).toEqual([]);
    expect(
      await getPublicServices(
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ items: "nope" }), { status: 200 }),
        ),
      ),
    ).toEqual([]);
    delete process.env.API_BASE_URL;
    expect(await getPublicServices()).toEqual([]);
  });
});
