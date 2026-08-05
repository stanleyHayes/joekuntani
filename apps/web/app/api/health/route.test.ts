import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns a non-cacheable readiness response", async () => {
    const response = GET();
    await expect(response.json()).resolves.toEqual({ status: "ready" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
