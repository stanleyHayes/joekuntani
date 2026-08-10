import { beforeEach, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ path: vi.fn(), tag: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidatePath: cache.path,
  revalidateTag: cache.tag,
}));

import { POST, SECRET_HEADER } from "./route";

const SECRET = "b8c1f0d2e3a45566778899aabbccddeeff00112233445566";

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
  vi.stubEnv("CACHE_INVALIDATION_SECRET", SECRET);
  vi.stubEnv("NODE_ENV", "test");
  // Nothing here should reach the network: the secret is the whole check.
  vi.stubGlobal("fetch", vi.fn());
});

function request(
  overrides: Partial<typeof body> = {},
  headers: Record<string, string> = {},
) {
  return new Request("https://site.example/api/admin/cms/cache-invalidation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [SECRET_HEADER]: SECRET,
      ...headers,
    },
    body: JSON.stringify({ ...body, ...overrides }),
  });
}

it("invalidates exactly the paths and tags the payload names", async () => {
  const response = await POST(request());
  expect(response.status).toBe(204);
  expect(cache.path.mock.calls).toEqual([["/"], ["/about"]]);
  expect(cache.tag).toHaveBeenCalledWith("content:page", { expire: 0 });
  // The console already proved who the operator is; this route asks nobody.
  expect(fetch).not.toHaveBeenCalled();
});

// The console runs on another origin, so a browser session can never reach
// here — the secret replaces the origin, CSRF and role checks that used to
// guard it, and it has to be the only thing that opens the door.
it.each([
  ["a wrong secret of equal length", SECRET.replace(/.$/, "0")],
  ["a wrong secret of another length", "short"],
  ["an empty secret", ""],
])("rejects %s", async (_name, presented) => {
  const response = await POST(request({}, { [SECRET_HEADER]: presented }));
  expect(response.status).toBe(403);
  expect(cache.path).not.toHaveBeenCalled();
});

it("rejects a request carrying no secret at all", async () => {
  const bare = new Request(
    "https://site.example/api/admin/cms/cache-invalidation",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  expect((await POST(bare)).status).toBe(403);
  expect(cache.path).not.toHaveBeenCalled();
});

// Fails closed: a deployment that forgets the variable must stop invalidating
// rather than accept whoever finds the URL.
it.each([
  ["unset", ""],
  ["too short to be a secret", "short-secret"],
])("authorises nobody when the configured secret is %s", async (_n, value) => {
  vi.stubEnv("CACHE_INVALIDATION_SECRET", value);
  expect((await POST(request({}, { [SECRET_HEADER]: value }))).status).toBe(403);
  expect(cache.path).not.toHaveBeenCalled();
});

// The payload cannot name arbitrary paths: they are recomputed from the kind,
// slug and id, so a valid secret still cannot flush the whole site.
it.each([
  ["a fabricated revision", { revision: 0 }],
  ["paths that do not match the item", { paths: ["/"] }],
  ["tags that do not match the item", { tags: ["public-content"] }],
  ["an unknown kind", { kind: "invoice" }],
  ["an unknown action", { action: "delete" }],
  ["an unexpected field", { unexpected: true }],
])("rejects %s", async (_name, overrides) => {
  const response = await POST(request(overrides as Partial<typeof body>));
  expect(response.status).toBe(422);
  expect(cache.path).not.toHaveBeenCalled();
});

it("rejects a body that is not JSON", async () => {
  const malformed = new Request(
    "https://site.example/api/admin/cms/cache-invalidation",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SECRET_HEADER]: SECRET,
      },
      body: "{",
    },
  );
  expect((await POST(malformed)).status).toBe(400);
});

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
