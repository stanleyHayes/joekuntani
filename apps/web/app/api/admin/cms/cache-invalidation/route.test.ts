import { beforeEach, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ path: vi.fn(), tag: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidatePath: cache.path,
  revalidateTag: cache.tag,
}));

import { POST } from "./route";

const body = {
  content_id: "123e4567-e89b-42d3-a456-426614174000",
  revision: 7,
  kind: "page",
  slug: "about",
  action: "publish",
  paths: ["/", "/about"],
  tags: [
    "public-content",
    "content:page",
    "content:123e4567-e89b-42d3-a456-426614174000",
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("API_BASE_URL", "https://api.internal");
  vi.stubEnv("PUBLIC_WEB_URL", "https://admin.example");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ role: "administrator" })),
  );
});

function request(
  overrides: Partial<typeof body> = {},
  headers: Record<string, string> = {},
) {
  return new Request("https://admin.example/api/admin/cms/cache-invalidation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://admin.example",
      cookie: "jk_admin_session=session; jk_admin_csrf=csrf-token",
      "X-CSRF-Token": "csrf-token",
      ...headers,
    },
    body: JSON.stringify({ ...body, ...overrides }),
  });
}

it("authenticates the administrator and invalidates exact paths and tags", async () => {
  const response = await POST(request());
  expect(response.status).toBe(204);
  expect(fetch).toHaveBeenCalledWith(
    "https://api.internal/api/admin/auth/me",
    expect.objectContaining({
      headers: { cookie: "jk_admin_session=session; jk_admin_csrf=csrf-token" },
      cache: "no-store",
    }),
  );
  expect(cache.path.mock.calls).toEqual([["/"], ["/about"]]);
  expect(cache.tag).toHaveBeenCalledWith("content:page", { expire: 0 });
});

it("ignores forged forwarding headers and accepts only the configured origin", async () => {
  const proxied = request(
    {},
    {
      host: "internal-web:3000",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
    },
  );
  expect((await POST(proxied)).status).toBe(204);
});

it("allows an exact configured local HTTP origin outside production", async () => {
  vi.stubEnv("PUBLIC_WEB_URL", "http://localhost:3000");
  const local = request({}, { origin: "http://localhost:3000" });
  expect((await POST(local)).status).toBe(204);
});

it("allows an exact configured HTTPS origin in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await POST(request())).status).toBe(204);
});

it.each([
  ["credentials", "https://user:secret@admin.example"],
  ["path", "https://admin.example/admin"],
  ["query", "https://admin.example?admin=true"],
  ["fragment", "https://admin.example#admin"],
  ["trailing slash", "https://admin.example/"],
] as const)("rejects a raw Origin containing %s", async (_name, origin) => {
  expect((await POST(request({}, { origin }))).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
  expect(cache.path).not.toHaveBeenCalled();
});

it.each([
  ["missing configuration", "", "https://admin.example", "test"],
  ["malformed configuration", "not a URL", "https://admin.example", "test"],
  [
    "configured credentials",
    "https://user:secret@admin.example",
    "https://admin.example",
    "test",
  ],
  [
    "configured path",
    "https://admin.example/admin",
    "https://admin.example",
    "test",
  ],
  ["wrong origin", "https://admin.example", "https://evil.example", "test"],
  [
    "insecure production origin",
    "http://localhost:3000",
    "http://localhost:3000",
    "production",
  ],
] as const)("rejects %s", async (_name, configured, origin, environment) => {
  vi.stubEnv("PUBLIC_WEB_URL", configured);
  vi.stubEnv("NODE_ENV", environment);
  expect((await POST(request({}, { origin }))).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
  expect(cache.path).not.toHaveBeenCalled();
});

it.each([
  ["cross origin", {}, { origin: "https://evil.example" }, 403],
  ["missing csrf", {}, { "X-CSRF-Token": "" }, 403],
  ["fake revision", { revision: 0 }, {}, 422],
  ["forged path", { paths: ["/"] }, {}, 422],
  ["unknown field", { unexpected: true }, {}, 422],
] as const)("rejects %s", async (_name, overrides, headers, status) => {
  expect(
    (await POST(request(overrides as Partial<typeof body>, headers))).status,
  ).toBe(status);
  expect(cache.path).not.toHaveBeenCalled();
});

it.each(["content_editor", "booking_manager", "analyst"])(
  "denies the %s role",
  async (role) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ role })));
    expect((await POST(request())).status).toBe(403);
    expect(cache.path).not.toHaveBeenCalled();
  },
);

it("reports revalidation failure without claiming success", async () => {
  cache.path.mockImplementationOnce(() => {
    throw new Error("cache unavailable");
  });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    title: "Cache invalidation unavailable",
  });
});
