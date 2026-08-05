import { describe, expect, it } from "vitest";

import { scrubSentryEvent } from "./sentry";

describe("scrubSentryEvent", () => {
  it("removes request secrets and PII", () => {
    const event = scrubSentryEvent({
      type: undefined,
      breadcrumbs: [{ message: "private breadcrumb" }],
      contexts: { private_context: { email: "private@example.com" } },
      extra: { token: "private" },
      message: "private message",
      tags: { customer: "private" },
      user: { email: "private@example.com" },
      exception: { values: [{ type: "Error", value: "private error" }] },
      request: {
        cookies: { session: "private" },
        data: "private body",
        headers: { authorization: "Bearer private" },
        query_string: "email=private@example.com",
        url: "https://example.com/path?token=private",
      },
    });

    expect(event).toEqual({
      type: undefined,
      exception: { values: [{ type: "Error", value: "[REDACTED]" }] },
    });
  });

  it("leaves events without request data intact", () => {
    const event = { type: undefined, message: "safe" };
    expect(scrubSentryEvent(event)).toBe(event);
  });

  it("keeps only a redacted transaction name", () => {
    expect(
      scrubSentryEvent({
        type: "transaction",
        transaction: "user@example.com",
        spans: [],
      }),
    ).toEqual({ type: "transaction", transaction: "[REDACTED]" });
  });
});
