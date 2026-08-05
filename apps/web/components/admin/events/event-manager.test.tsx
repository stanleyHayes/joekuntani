import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventManager } from "./event-manager";

const event = {
  id: "event-id",
  slug: "approved-event",
  title: "Approved event",
  summary: "Approved summary",
  description: "Approved description",
  starts_at: "2026-09-01T18:00:00Z",
  ends_at: "2026-09-01T21:00:00Z",
  timezone: "Africa/Accra",
  capacity: 100,
  status: "draft" as const,
  banner_asset_id: "asset-id",
  banner: { featured: false },
  venue: {
    name: "Approved venue",
    address: "Approved address",
    city: "Accra",
    country_code: "GH",
  },
  policies: {
    refunds: "Approved refunds",
    entry: "Approved entry",
    age_limit: 18,
  },
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
      await screen.findByText("No approved event content exists yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add event" })).toBeEnabled();
  });

  it("loads an authorized preview and exposes explicit lifecycle controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({ tickets: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventManager />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit and preview Approved event",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Ticket types" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish event" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Cancel event" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/events/event-id/preview",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("reports publish invariant failures without changing client state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({ tickets: [] }))
      .mockResolvedValueOnce(response({}, 409));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventManager />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit and preview Approved event",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Publish event" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add valid ticket types",
    );
    expect(
      screen.getByRole("button", { name: "Publish event" }),
    ).toBeInTheDocument();
  });

  it("submits a ticket with CSRF protection and displays server-derived state", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "jk_admin_csrf=test-token",
    });
    const ticket = {
      id: "ticket-id",
      name: "General admission",
      description: "Standard access",
      price: "150.00",
      currency: "GHS",
      capacity: 60,
      sold: 0,
      reserved: 0,
      min_per_order: 1,
      max_per_order: 6,
      sales_start: "2026-08-06T10:00:00Z",
      sales_end: "2026-08-31T10:00:00Z",
      paused: false,
      status: "scheduled",
      sort_order: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({ tickets: [] }))
      .mockResolvedValueOnce(response(ticket));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventManager />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit and preview Approved event",
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Ticket name" }), {
      target: { value: "General admission" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Price" }), {
      target: { value: "150.00" },
    });
    fireEvent.change(screen.getByLabelText("Sales start"), {
      target: { value: "2026-08-06T10:00" },
    });
    fireEvent.change(screen.getByLabelText("Sales end"), {
      target: { value: "2026-08-31T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add ticket type" }));
    await waitFor(() =>
      expect(screen.getByText(/scheduled/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/events/event-id/tickets",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "test-token" }),
      }),
    );
  });

  it("reports list and protected-preview failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 503)));
    const first = render(<EventManager />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Events could not be loaded",
    );
    first.unmount();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({}, 403));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventManager />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit and preview Approved event",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "protected preview",
    );
  });

  it("creates an event draft through the server instead of setting lifecycle state", async () => {
    const saved = { ...event, id: "new-event" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response(saved));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventManager />);
    await screen.findByText("No approved event content exists yet.");
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Approved event" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Approved summary" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Approved description" },
    });
    fireEvent.change(screen.getByLabelText("Starts at"), {
      target: { value: "2026-09-01T18:00" },
    });
    fireEvent.change(screen.getByLabelText("Ends at"), {
      target: { value: "2026-09-01T21:00" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Venue" }), {
      target: { value: "Approved venue" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Address" }), {
      target: { value: "Approved address" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "City" }), {
      target: { value: "Accra" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Refund policy" }), {
      target: { value: "Approved refunds" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Entry policy" }), {
      target: { value: "Approved entry" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText("Event draft saved and audited."),
    ).toBeInTheDocument();
    const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).not.toHaveProperty("status");
  });

  it("uses explicit server actions for published ticket pause and event cancellation", async () => {
    const published = { ...event, status: "published" as const };
    const ticket = {
      id: "ticket-id",
      name: "General admission",
      description: "Standard access",
      price: "150.00",
      currency: "GHS",
      capacity: 60,
      sold: 4,
      reserved: 2,
      min_per_order: 1,
      max_per_order: 6,
      sales_start: "2026-08-06T10:00:00Z",
      sales_end: "2026-08-31T10:00:00Z",
      paused: false,
      status: "on_sale",
      sort_order: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [published] }))
      .mockResolvedValueOnce(response({ tickets: [ticket] }))
      .mockResolvedValueOnce(
        response({ ...ticket, paused: true, status: "paused" }),
      )
      .mockResolvedValueOnce(response({ ...published, status: "cancelled" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventManager />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit and preview Approved event",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Pause sales" }));
    expect(await screen.findByText("Ticket sales paused.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
    expect(await screen.findByText("Event cancelled.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel event" }),
    ).not.toBeInTheDocument();
  });
  it("requires and previews a complete featured banner schedule", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ items: [] })));
    render(<EventManager />);
    await screen.findByText("No approved event content exists yet.");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Feature this event in a scheduled banner",
      }),
    );
    const asset = screen.getByRole("textbox", { name: "Banner asset UUID" });
    expect(asset).toBeRequired();
    fireEvent.change(asset, {
      target: { value: "00000000-0000-4000-8000-000000000099" },
    });
    fireEvent.change(screen.getByLabelText("Banner starts at"), {
      target: { value: "2026-08-06T10:00" },
    });
    fireEvent.change(screen.getByLabelText("Banner ends at"), {
      target: { value: "2026-08-07T10:00" },
    });
    expect(
      screen.getByText(/Banner preview: asset 00000000/),
    ).toHaveTextContent("2026-08-06T10:00");
  });

  it("edits a ticket type through PUT with the real CSRF cookie", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "jk_admin_csrf=event-csrf",
    });
    const ticket = {
      id: "ticket-id",
      name: "General admission",
      description: "Standard access",
      price: "150.00",
      currency: "GHS",
      capacity: 60,
      sold: 0,
      reserved: 0,
      min_per_order: 1,
      max_per_order: 6,
      sales_start: "2026-08-06T10:00:00Z",
      sales_end: "2026-08-31T10:00:00Z",
      paused: false,
      status: "scheduled",
      sort_order: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({ tickets: [ticket] }))
      .mockResolvedValueOnce(response({ ...ticket, name: "Early access" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventManager />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit and preview Approved event",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Edit ticket type General admission",
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Ticket name" }), {
      target: { value: "Early access" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update ticket type" }));
    expect(
      await screen.findByText("Ticket type updated and audited."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/events/event-id/tickets/ticket-id",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "X-CSRF-Token": "event-csrf",
        }),
      }),
    );
  });
});

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
