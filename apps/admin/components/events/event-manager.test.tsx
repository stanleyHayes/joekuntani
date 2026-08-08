import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventManager } from "./event-manager";

const event = {
  id: "event id",
  slug: "approved-event",
  title: "Approved event",
  status: "draft" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EventManager", () => {
  it("shows a content-safe empty state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ items: [] })));
    render(<EventManager />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading events");
    expect(
      await screen.findByText(
        "Start with a private draft, add ticket types, then preview it before publishing.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add event" })).toHaveAttribute(
      "href",
      "/events/new",
    );
    expect(
      screen.getByRole("link", { name: "Create the first event" }),
    ).toHaveAttribute("href", "/events/new");
  });

  it("routes to the editor instead of opening a dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ items: [event] })),
    );
    render(<EventManager />);
    // The id is encoded, so a stored id with a space cannot break the address.
    expect(
      await screen.findByRole("link", {
        name: "Edit and preview Approved event",
      }),
    ).toHaveAttribute("href", "/events/event%20id");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  });

  it("reports a list failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 503)));
    render(<EventManager />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Events could not be loaded",
    );
  });
});

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
