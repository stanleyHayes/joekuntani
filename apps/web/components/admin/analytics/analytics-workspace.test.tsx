import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsWorkspace } from "./analytics-workspace";

afterEach(() => vi.unstubAllGlobals());

describe("AnalyticsWorkspace", () => {
  it("renders privacy-safe overview KPIs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: "2026-08-05T19:00:00Z",
        conversion_total: 12,
        booking_submitted: 4,
        ticket_purchases: 2,
        pipeline: { new: 3, won: 1 },
        bookings_by_status: { confirmed: 2 },
        campaigns_by_status: { active: 1 },
        content_published: 8,
        top_sources: [{ name: "web", count: 4 }],
        top_paths: [{ name: "/services", count: 6 }],
        audience: [{ platform: "instagram", metric_date: "2026-08-01", followers: 100, reach: 50, impressions: 200 }],
      }),
    }));
    render(<AnalyticsWorkspace />);
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByLabelText("Overview KPIs")).toBeInTheDocument();
    expect(screen.getByText("instagram")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("fails closed when overview cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<AnalyticsWorkspace />);
    expect(await screen.findByRole("status")).toHaveTextContent("Analytics are unavailable.");
  });
});
