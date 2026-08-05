import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublicServices } from "./data";
import type { PublicService } from "./types";

function service(
  id: string,
  active: boolean,
  sortOrder: number,
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
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await getPublicServices(fetcher);
    expect(result.map((item) => item.id)).toEqual(["first", "later"]);
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
    delete process.env.API_BASE_URL;
    expect(await getPublicServices()).toEqual([]);
  });
});
