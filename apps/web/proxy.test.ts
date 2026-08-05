import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

describe("admin authentication proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.API_BASE_URL;
  });

  it("forwards the root-scoped browser session to API verification", async () => {
    process.env.API_BASE_URL = "http://api.internal";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "018f47f6-9f5d-7d3a-8d4e-45f0f7d4c201" }),
          { status: 200 },
        ),
      );
    const response = await proxy(
      new NextRequest("https://admin.example/admin", {
        headers: { cookie: "jk_admin_session=opaque; jk_admin_csrf=csrf" },
      }),
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.internal/api/admin/auth/me",
      expect.objectContaining({
        headers: { cookie: "jk_admin_session=opaque; jk_admin_csrf=csrf" },
        cache: "no-store",
      }),
    );
  });

  it("allows login pages and fails closed for an unverifiable session", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline"));
    expect(
      (await proxy(new NextRequest("https://admin.example/admin/login")))
        .status,
    ).toBe(200);
    process.env.API_BASE_URL = "http://api.internal";
    const rejected = await proxy(
      new NextRequest("https://admin.example/admin/settings"),
    );
    expect(rejected.status).toBe(307);
    expect(rejected.headers.get("location")).toBe(
      "https://admin.example/admin/login",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
