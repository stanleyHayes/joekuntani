import { render, screen, waitFor } from "@testing-library/react";

import { OverviewCharts } from "./overview-charts";

const analytics = {
  conversion_total: 12,
  booking_submitted: 5,
  ticket_purchases: 2,
  content_published: 7,
  pipeline: { new: 8, won: 4 },
  bookings_by_status: { submitted: 5 },
  top_sources: [
    { name: "instagram", count: 8 },
    { name: "direct", count: 4 },
  ],
  top_paths: [{ name: "/events", count: 9 }],
  audience: [
    { platform: "Instagram", metric_date: "2026-08-01", followers: 100 },
    { platform: "Instagram", metric_date: "2026-08-08", followers: 120 },
  ],
};

const tickets = {
  inventory: {
    quantity_total: 20,
    quantity_reserved: 3,
    quantity_sold: 6,
    quantity_available: 11,
  },
};

describe("OverviewCharts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("turns empty analytics into useful next actions", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...analytics,
            conversion_total: 0,
            booking_submitted: 0,
            content_published: 0,
            pipeline: {},
            bookings_by_status: {},
            top_sources: [],
            top_paths: [],
            audience: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            inventory: {
              quantity_total: 0,
              quantity_reserved: 0,
              quantity_sold: 0,
              quantity_available: 0,
            },
          }),
          { status: 200 },
        ),
      );

    render(<OverviewCharts />);

    expect(
      screen.getByLabelText("Loading overview metrics"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Open CRM/ }),
    ).toHaveAttribute("href", "/crm");
    expect(
      screen.getByRole("link", { name: /Create an event/ }),
    ).toHaveAttribute("href", "/events/new");
    expect(
      screen.getAllByRole("link", { name: /Open analytics/ }),
    ).toHaveLength(2);
  });

  it("renders measured conversion, source, inventory, and audience data", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(analytics), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(tickets), { status: 200 }),
      );

    render(<OverviewCharts />);

    await waitFor(() =>
      expect(
        screen.queryByLabelText("Loading overview metrics"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Instagram · followers")).toBeInTheDocument();
    expect(screen.getByLabelText(/Of 20 tickets, 6 sold/)).toBeInTheDocument();
    expect(screen.getByLabelText(/12 measured arrivals/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Follower trend from 100 to 120/),
    ).toBeInTheDocument();
  });

  it("keeps available analytics visible when ticket inventory fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(analytics), { status: 200 }),
      )
      .mockRejectedValueOnce(new Error("ticket dashboard unavailable"));

    render(<OverviewCharts />);

    expect(
      await screen.findByText("Conversions recorded across the site"),
    ).toBeInTheDocument();
    expect(screen.getByText("no capacity")).toBeInTheDocument();
  });
});
