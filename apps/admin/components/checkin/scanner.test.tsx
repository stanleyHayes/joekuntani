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
});
