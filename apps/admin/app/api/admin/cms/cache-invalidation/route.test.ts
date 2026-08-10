import { beforeEach, expect, it, vi } from "vitest";

import { POST } from "./route";

const SECRET = "b8c1f0d2e3a45566778899aabbccddeeff00112233445566";

const payload = {
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

/** Answers the role lookup, then the forwarded invalidation. */
function stubCalls(
  role: unknown = { role: "administrator" },
  forwarded: Response = new Response(null, { status: 204 }),
) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json(role))
    .mockResolvedValueOnce(forwarded);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("API_BASE_URL", "https://api.internal");
  vi.stubEnv("PUBLIC_ADMIN_URL", "https://console.example");
  vi.stubEnv("PUBLIC_WEB_URL", "https://site.example");
  vi.stubEnv("CACHE_INVALIDATION_SECRET", SECRET);
  vi.stubEnv("NODE_ENV", "test");
});

function request(headers: Record<string, string> = {}) {
  return new Request(
    "https://console.example/api/admin/cms/cache-invalidation",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://console.example",
        cookie: "jk_admin_session=session; jk_admin_csrf=csrf-token",
        "X-CSRF-Token": "csrf-token",
        ...headers,
      },
      body: JSON.stringify(payload),
    },
  );
}

it("checks the operator here, then forwards to the public site with the secret", async () => {
  const fetchMock = stubCalls();
  const response = await POST(request());

  expect(response.status).toBe(204);
  expect(fetchMock.mock.calls[0][0]).toBe(
    "https://api.internal/api/admin/auth/me",
  );
  const [url, init] = fetchMock.mock.calls[1];
  expect(url).toBe("https://site.example/api/admin/cms/cache-invalidation");
  expect(init.headers["x-cache-invalidation-secret"]).toBe(SECRET);
  // Forwarded verbatim: the public site is the authority on the payload.
  expect(JSON.parse(init.body)).toEqual(payload);
});

// The session cookie is set on this host, so these checks belong here — the
// public site cannot make them.
it.each([
  ["a cross-origin request", { origin: "https://evil.example" }],
  ["a missing CSRF header", { "X-CSRF-Token": "" }],
  ["a CSRF header that does not match the cookie", { "X-CSRF-Token": "other" }],
])("rejects %s before calling anything", async (_name, headers) => {
  const fetchMock = stubCalls();
  expect((await POST(request(headers))).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(["content_editor", "booking_manager", "analyst"])(
  "denies the %s role and never forwards",
  async (role) => {
    const fetchMock = stubCalls({ role });
    expect((await POST(request())).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

// Publishing appearing to succeed while the site serves the old page is the
// exact failure this endpoint exists to prevent, so misconfiguration is loud.
it.each([
  ["no public site is configured", "PUBLIC_WEB_URL", ""],
  ["the public site URL is malformed", "PUBLIC_WEB_URL", "not a URL"],
  ["the secret is missing", "CACHE_INVALIDATION_SECRET", ""],
  ["the secret is too short", "CACHE_INVALIDATION_SECRET", "short"],
])("reports that it is not configured when %s", async (_name, key, value) => {
  const fetchMock = stubCalls();
  vi.stubEnv(key, value);
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    title: "Cache invalidation is not configured",
  });
  // The role lookup ran; the forward did not.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("refuses an insecure public site in production", async () => {
  stubCalls();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PUBLIC_WEB_URL", "http://site.example");
  expect((await POST(request())).status).toBe(503);
});

// Each reason implies a different action, so they must not collapse into one.
it.each([
  [403, 403, "The public site rejected the invalidation secret"],
  [422, 422, "Invalid cache invalidation request"],
  [500, 502, "The public site could not be reached"],
])(
  "maps a %s from the public site to %s",
  async (upstream, expected, title) => {
    stubCalls({ role: "administrator" }, new Response(null, { status: upstream }));
    const response = await POST(request());
    expect(response.status).toBe(expected);
    expect(await response.json()).toMatchObject({ title });
  },
);

it("reports a public site that never answers", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ role: "administrator" }))
      .mockRejectedValueOnce(new Error("timed out")),
  );
  const response = await POST(request());
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({
    title: "The public site did not respond",
  });
});
