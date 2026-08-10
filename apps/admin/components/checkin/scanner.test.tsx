import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scanner } from "./scanner";

beforeEach(() => {
  Object.defineProperty(document, "cookie", {
    value: "jk_admin_csrf=token",
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

describe("Scanner", () => {
  const EVENT = "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201";

  it("submits a CSRF-protected scan and shows a privacy-safe result", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/count")) {
        return Response.json({
          event_id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201",
          checked_in_count: 0,
        });
      }
      if (url.includes("/scan") && init?.method === "POST") {
        return Response.json({
          result: "admitted",
          ticket_ref: "…c299",
          checked_in_count: 1,
          message: "Admitted",
          checked_in_at: "2026-08-05T20:00:00Z",
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Scanner />);
    fireEvent.change(screen.getByLabelText(/Event ID/i), {
      target: { value: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201" },
    });
    fireEvent.change(screen.getByLabelText(/Scanned token/i), {
      target: { value: "bearer-token-123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Check in/i }));
    expect(
      await screen.findByRole("heading", { name: "Admitted" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ticket ref/)).toHaveTextContent("…c299");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/checkin/scan",
        expect.objectContaining({
          method: "POST",
          credentials: "same-origin",
          headers: expect.objectContaining({ "X-CSRF-Token": "token" }),
        }),
      ),
    );
  });

  it("surfaces offline guidance without calling the scan API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    render(<Scanner />);
    fireEvent.change(screen.getByLabelText(/Event ID/i), {
      target: { value: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201" },
    });
    fireEvent.change(screen.getByLabelText(/Scanned token/i), {
      target: { value: "bearer-token-123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Check in/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Offline/i),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/admin/checkin/scan",
      expect.anything(),
    );
  });

  /** Answers the live count, then whatever the scan should return. */
  function stubDoor(scan: unknown, status = 200, count = 0) {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/count"))
        return Response.json({ event_id: EVENT, checked_in_count: count });
      if (String(input).includes("/scan") && init?.method === "POST")
        return status === 200
          ? Response.json(scan)
          : new Response(JSON.stringify(scan), { status });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function scan(token = "bearer-token-123456") {
    fireEvent.change(screen.getByLabelText(/Event ID/i), {
      target: { value: EVENT },
    });
    fireEvent.change(screen.getByLabelText(/Scanned token/i), {
      target: { value: token },
    });
    fireEvent.click(screen.getByRole("button", { name: /Check in/i }));
  }

  // Every verdict the door can reach has to name itself. A guest turned away
  // by a blank screen becomes an argument at the gate.
  it.each([
    ["admitted", "Admitted"],
    ["already_checked_in", "Already checked in"],
    ["invalid", "Ticket not recognized"],
    ["wrong_event", "Wrong event"],
    ["not_valid", "Not valid for admission"],
  ])("names the %s verdict", async (result, heading) => {
    stubDoor({ result, ticket_ref: "…c299", checked_in_count: 1 });
    render(<Scanner />);
    scan();
    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
  });

  // A duplicate is the common case on a busy door, and the API reports it as a
  // 409 — which must read as a verdict, not as a failed request.
  it("treats a duplicate 409 as a verdict rather than an error", async () => {
    stubDoor(
      {
        result: "already_checked_in",
        ticket_ref: "…c299",
        checked_in_count: 4,
        checked_in_at: "2026-08-05T20:00:00Z",
      },
      409,
    );
    render(<Scanner />);
    scan();
    expect(
      await screen.findByRole("heading", { name: "Already checked in" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Checked in at/)).toBeInTheDocument();
    expect(screen.queryByText(/could not be completed/i)).toBeNull();
  });

  it("reports a failed scan without inventing a verdict", async () => {
    stubDoor({ error: "boom" }, 500);
    render(<Scanner />);
    scan();
    expect(
      await screen.findByText("Check-in could not be completed. Try again."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admitted" })).toBeNull();
  });

  // The token box has to clear itself, or the next guest is scanned as the
  // previous one.
  it("clears the token after a scan so the next guest is not a repeat", async () => {
    stubDoor({ result: "admitted", ticket_ref: "…c299", checked_in_count: 1 });
    render(<Scanner />);
    scan();
    await screen.findByRole("heading", { name: "Admitted" });
    expect(screen.getByLabelText(/Scanned token/i)).toHaveValue("");
  });

  it("shows live attendance once an event is known", async () => {
    stubDoor({ result: "admitted", checked_in_count: 7 }, 200, 7);
    render(<Scanner />);
    expect(
      screen.getByText("Enter an event ID to load live attendance."),
    ).toBeInTheDocument();
    scan();
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText(/Refreshes every 5 seconds/)).toBeInTheDocument();
  });

  // Losing signal mid-shift is reported by a window event, not by a scan. The
  // door has to notice immediately and recover on its own when signal returns,
  // or a steward keeps scanning into a dead form.
  it("reacts to the connection dropping and returning", async () => {
    stubDoor({ result: "admitted", checked_in_count: 1 });
    render(<Scanner />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /Check in/i })).toBeEnabled();

    fireEvent(window, new Event("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Offline/i);
    expect(screen.getByRole("button", { name: /Check in/i })).toBeDisabled();

    fireEvent(window, new Event("online"));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: /Check in/i })).toBeEnabled();
  });
});
