import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventEditor } from "./event-editor";

// The banner image is now chosen with a file picker rather than typed as a
// UUID, so the upload call is stubbed to return a known asset.
vi.mock("../media/media-admin", () => ({
  // The picker resolves stored ids to a preview, so the listing is stubbed too.
  listAssets: vi.fn(async () => []),
  requestUpload: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000099",
    publicUrl: "https://cdn.example.test/banner.png",
    status: "ready",
  })),
}));

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EventEditor", () => {
  it("loads an authorized preview and exposes explicit lifecycle controls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({ tickets: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventEditor eventID="event-id" />);
    expect(
      await screen.findByRole("heading", { name: "Ticket types" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish event" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Cancel event" }),
    ).not.toBeInTheDocument();
    // The form is a page, not a modal, so nothing is trapped behind a dialog.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/events/event-id/preview",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("reports an event that cannot be opened", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ items: [] })));
    render(<EventEditor eventID="missing-id" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That event could not be opened",
    );
    expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  });

  it("reports publish invariant failures without changing client state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({ tickets: [] }))
      .mockResolvedValueOnce(response({}, 409));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventEditor eventID="event-id" />);
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({ tickets: [] }))
      .mockResolvedValueOnce(response(ticket));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventEditor eventID="event-id" />);
    expect(
      await screen.findByRole("button", { name: "Add ticket type" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Ticket name" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add ticket type" }));
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

  it("reports a protected-preview failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({}, 403));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventEditor eventID="event-id" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "protected preview",
    );
  });

  it("creates an event draft through the server instead of setting lifecycle state", async () => {
    const saved = { ...event, id: "new-event" };
    const fetchMock = vi.fn().mockResolvedValueOnce(response(saved));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventEditor eventID="new" />);
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
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/admin/events");
    expect(JSON.parse(String(request.body))).not.toHaveProperty("status");
    // The address stops claiming to be a blank form once the id exists, so a
    // reload lands on the saved record.
    expect(window.location.pathname).toBe("/events/new-event");
    // Ticket types only become reachable once the server has minted an id.
    expect(
      screen.getByRole("heading", { name: "Ticket types" }),
    ).toBeInTheDocument();
  });

  it("rewrites summary copy through the assistant without renaming the field", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("A night of comedy and guitar."));
          controller.close();
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EventEditor eventID="new" />);

    const summary = screen.getByRole("textbox", { name: "Summary" });
    fireEvent.change(summary, { target: { value: "joe does a funny show" } });

    fireEvent.click(
      within(summary.closest("div") as HTMLElement).getByRole("button", {
        name: /Rewrite/,
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Use this/ }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue(
        "A night of comedy and guitar.",
      ),
    );
    // The assist bar must stay outside the <label>, or its button text would
    // be folded into the textarea's accessible name.
    expect(
      screen.getByRole("textbox", { name: "Description" }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/admin/ai/assist");
  });

  it("uses explicit server actions for published ticket pause and event cancellation", async () => {
    const published = { ...event, status: "published" as const };
    const onSale = { ...ticket, sold: 4, reserved: 2, status: "on_sale" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [published] }))
      .mockResolvedValueOnce(response({ tickets: [onSale] }))
      .mockResolvedValueOnce(
        response({ ...onSale, paused: true, status: "paused" }),
      )
      .mockResolvedValueOnce(response({ ...published, status: "cancelled" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventEditor eventID="event-id" />);
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
    render(<EventEditor eventID="new" />);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Feature this event in a scheduled banner",
      }),
    );
    // No UUID box: the banner is picked from the device.
    expect(
      screen.queryByRole("textbox", { name: /Banner asset UUID/ }),
    ).toBeNull();
    const picker = screen.getByLabelText("Choose Banner image");
    expect(picker).toHaveAttribute("type", "file");
    fireEvent.change(picker, {
      target: {
        files: [new File(["x"], "banner.png", { type: "image/png" })],
      },
    });
    await screen.findByRole("button", { name: "Remove" });
    fireEvent.click(screen.getByRole("button", { name: "Banner starts at" }));
    const startsDialog = screen.getByRole("dialog", {
      name: "Banner starts at",
    });
    fireEvent.change(within(startsDialog).getByLabelText("Hour"), {
      target: { value: "10" },
    });
    fireEvent.change(within(startsDialog).getByLabelText("Minute"), {
      target: { value: "0" },
    });
    fireEvent.click(
      within(startsDialog)
        .getAllByRole("button", { name: "6" })
        .find((button) => button.dataset.inMonth === "true")!,
    );
    fireEvent.click(screen.getByRole("button", { name: "Banner starts at" }));

    fireEvent.click(screen.getByRole("button", { name: "Banner ends at" }));
    const endsDialog = screen.getByRole("dialog", { name: "Banner ends at" });
    fireEvent.change(within(endsDialog).getByLabelText("Hour"), {
      target: { value: "10" },
    });
    fireEvent.change(within(endsDialog).getByLabelText("Minute"), {
      target: { value: "0" },
    });
    fireEvent.click(
      within(endsDialog)
        .getAllByRole("button", { name: "7" })
        .find((button) => button.dataset.inMonth === "true")!,
    );
    expect(
      screen.getByText(/Banner preview: asset 00000000/),
    ).toHaveTextContent("2026-08-06T10:00");
  });

  it("edits a ticket type through PUT with the real CSRF cookie", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "jk_admin_csrf=event-csrf",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [event] }))
      .mockResolvedValueOnce(response({ tickets: [ticket] }))
      .mockResolvedValueOnce(response({ ...ticket, name: "Early access" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventEditor eventID="event-id" />);
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
