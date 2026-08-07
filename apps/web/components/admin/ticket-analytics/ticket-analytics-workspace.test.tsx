import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketAnalyticsWorkspace } from "./ticket-analytics-workspace";

afterEach(() => vi.unstubAllGlobals());

describe("TicketAnalyticsWorkspace", () => {
  it("loads a privacy-safe dashboard without buyer fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: "2026-08-05T20:00:00Z",
        financial: true,
        sales: [
          {
            currency: "GHS",
            revenue: "100.00",
            fees: "5.00",
            refunded: "0.00",
            net: "95.00",
            orders: 1,
          },
        ],
        settlement: [
          {
            currency: "GHS",
            recorded_net: "95.00",
            provider_reported: "95.00",
            variance: "0.00",
            note: "provider_settlement_unavailable",
          },
        ],
        inventory: {
          quantity_total: 100,
          quantity_reserved: 10,
          quantity_sold: 40,
          quantity_available: 50,
        },
        funnel: {
          selection_started: 20,
          checkout_started: 12,
          purchase_completed: 8,
          purchase_failed: 2,
          checked_in_events: 5,
        },
        attendance: { valid: 30, checked_in: 25, void: 2, refunded: 3 },
        events: [
          {
            event_id: "018f47f6-9f5d-4d3a-8d4e-45f0f7d4c201",
            title: "Night Market",
            checked_in: 25,
            issued: 40,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<TicketAnalyticsWorkspace />);
    expect(
      await screen.findByRole("heading", { name: "Ticket analytics" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Night Market")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Attendance and inventory")).toHaveTextContent(
      "25",
    );
    expect(
      screen.getByText("Recorded sales vs settlement"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/ticket-analytics/dashboard",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
    expect(document.body.textContent).not.toMatch(/buyer@|qr_token/i);
  });

  it("hides financial tables when the API omits sales", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          generated_at: "2026-08-05T20:00:00Z",
          financial: false,
          inventory: {
            quantity_total: 10,
            quantity_reserved: 0,
            quantity_sold: 2,
            quantity_available: 8,
          },
          funnel: {
            selection_started: 1,
            checkout_started: 1,
            purchase_completed: 1,
            purchase_failed: 0,
            checked_in_events: 0,
          },
          attendance: { valid: 2, checked_in: 0, void: 0, refunded: 0 },
          events: [],
        }),
      }),
    );
    render(<TicketAnalyticsWorkspace />);
    expect(
      await screen.findByText(/Financial sales totals are visible only/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Recorded sales vs settlement"),
    ).not.toBeInTheDocument();
  });
});
