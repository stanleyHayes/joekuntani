import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  // Constructed with a single message in tests; the real classes take the
  // full APIError signature, which the route never depends on.
  class RateLimitError extends Error {}
  class AuthenticationError extends Error {}
  // A class, not an arrow fn — the route calls `new Anthropic(...)`.
  class Anthropic {
    messages = { stream: streamMock };
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
  }
  return { default: Anthropic };
});

const { POST } = await import("./route");

const ORIGIN = "https://admin.example";

function request(body: unknown, overrides: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/admin/ai/assist`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      cookie: "jk_admin_csrf=token-123",
      "x-csrf-token": "token-123",
      "content-type": "application/json",
      ...overrides,
    },
    body: JSON.stringify(body),
  });
}

/** Minimal stand-in for the SDK's async-iterable stream. */
function textStream(chunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of chunks) {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text },
        };
      }
    },
    abort: vi.fn(),
  };
}

beforeEach(() => {
  vi.stubEnv("PUBLIC_WEB_URL", ORIGIN);
  vi.stubEnv("API_BASE_URL", "https://api.example");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ role: "content_editor" }),
    }),
  );
  streamMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/admin/ai/assist", () => {
  it("streams the rewritten copy back as plain text", async () => {
    streamMock.mockReturnValue(textStream(["Joe brings ", "the house down."]));

    const response = await POST(
      request({ action: "rewrite", field: "summary", text: "joe is funny" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(await response.text()).toBe("Joe brings the house down.");
    // The draft must reach the model as data, fenced off from the instructions.
    const sent = streamMock.mock.calls[0][0];
    expect(sent.model).toBe("claude-opus-5");
    expect(sent.messages[0].content).toContain(
      "<draft>\njoe is funny\n</draft>",
    );
  });

  it("aborts the upstream request when the client disconnects", async () => {
    const stream = textStream(["never read"]);
    streamMock.mockReturnValue(stream);

    const response = await POST(request({ action: "rewrite", text: "hi" }));
    await response.body?.cancel();

    expect(stream.abort).toHaveBeenCalled();
  });

  it("rejects a cross-origin caller", async () => {
    const response = await POST(
      request(
        { action: "rewrite", text: "hi" },
        { origin: "https://evil.test" },
      ),
    );
    expect(response.status).toBe(403);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("rejects a mismatched CSRF token", async () => {
    const response = await POST(
      request({ action: "rewrite", text: "hi" }, { "x-csrf-token": "wrong" }),
    );
    expect(response.status).toBe(403);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("rejects a role without writing permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ role: "analyst" }),
      }),
    );
    const response = await POST(request({ action: "rewrite", text: "hi" }));
    expect(response.status).toBe(403);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown action and an empty draft", async () => {
    expect((await POST(request({ action: "hack", text: "hi" }))).status).toBe(
      422,
    );
    expect(
      (await POST(request({ action: "rewrite", text: "  " }))).status,
    ).toBe(422);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("rejects a draft beyond the size limit", async () => {
    const response = await POST(
      request({ action: "expand", text: "x".repeat(8001) }),
    );
    expect(response.status).toBe(422);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("reports a missing API key as unavailable rather than crashing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await POST(request({ action: "rewrite", text: "hi" }));
    expect(response.status).toBe(503);
    expect((await response.json()).title).toContain("not configured");
  });

  it("rejects a malformed JSON body", async () => {
    const bad = new Request(`${ORIGIN}/api/admin/ai/assist`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        cookie: "jk_admin_csrf=token-123",
        "x-csrf-token": "token-123",
      },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it("fails closed when the session check cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(
      (await POST(request({ action: "rewrite", text: "hi" }))).status,
    ).toBe(403);
  });

  it("fails closed when the origin allowlist is unset", async () => {
    vi.stubEnv("PUBLIC_WEB_URL", "");
    expect(
      (await POST(request({ action: "rewrite", text: "hi" }))).status,
    ).toBe(403);
  });

  it("maps a rejected key to 503 rather than leaking the SDK error", async () => {
    const { default: Anthropic } = (await import(
      "@anthropic-ai/sdk"
    )) as unknown as {
      default: { AuthenticationError: new (message: string) => Error };
    };
    streamMock.mockImplementation(() => {
      throw new Anthropic.AuthenticationError("bad key");
    });
    const response = await POST(request({ action: "rewrite", text: "hi" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("bad key");
  });

  it("maps a rate limit to 429", async () => {
    const { default: Anthropic } = (await import(
      "@anthropic-ai/sdk"
    )) as unknown as {
      default: { RateLimitError: new (message: string) => Error };
    };
    streamMock.mockImplementation(() => {
      throw new Anthropic.RateLimitError("slow down");
    });
    const response = await POST(request({ action: "rewrite", text: "hi" }));
    expect(response.status).toBe(429);
  });
});
