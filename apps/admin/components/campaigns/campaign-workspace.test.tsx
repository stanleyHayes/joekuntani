import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignWorkspace } from "./campaign-workspace";

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "jk_admin_csrf=; Max-Age=0";
});
const item = {
  id: "10000000-0000-4000-8000-000000000001",
  enquiry_id: "10000000-0000-4000-8000-000000000002",
  organization_id: "10000000-0000-4000-8000-000000000003",
  title: "Approved campaign",
  objective: "Approved objective",
  status: "draft",
  platforms: ["Instagram"],
  starts_on: "2026-08-10T00:00:00Z",
  ends_on: "2026-09-10T00:00:00Z",
  fee: { amount: "1000.00", currency: "GHS" },
  expenses: { amount: "100.00", currency: "GHS" },
  results: [],
  asset_ids: [],
};

it("lists campaigns and links each one to its own page", async () => {
  const fetcher = vi.fn(async () => Response.json({ items: [item] }));
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignWorkspace />);
  expect(
    await screen.findByRole("link", { name: /Approved campaign/ }),
  ).toHaveAttribute("href", `/campaigns/${item.id}`);
  expect(screen.getByRole("link", { name: "Add campaign" })).toHaveAttribute(
    "href",
    "/campaigns/new",
  );
  // Both the editor and the campaign itself are routes now, so the list opens
  // no modal of its own.
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("offers the editor from the empty state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [] })),
  );
  render(<CampaignWorkspace />);
  await screen.findByText("No campaigns for Joe yet");
  // The stage header carries one, the empty state the other.
  const links = screen.getAllByRole("link", { name: "Add campaign" });
  expect(links).toHaveLength(2);
  for (const link of links)
    expect(link).toHaveAttribute("href", "/campaigns/new");
});

it("shows a safe failure message when the list cannot load", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  render(<CampaignWorkspace />);
  expect(
    await screen.findByText("Joe’s campaign records could not be loaded."),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: /Approved campaign/ }),
  ).not.toBeInTheDocument();
});
