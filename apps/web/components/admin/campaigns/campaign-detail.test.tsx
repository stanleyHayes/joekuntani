import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignDetail } from "./campaign-detail";

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
const deliverable = {
  id: "10000000-0000-4000-8000-000000000009",
  title: "Launch reel",
  platform: "Instagram",
  format: "video",
  status: "submitted",
  approval_status: "pending",
  due_at: "2026-08-20T12:00:00Z",
  published_url: "",
  asset_ids: [],
};

it("loads campaign financials without a dialog", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ campaign: item, deliverables: [deliverable] }),
    ),
  );
  render(<CampaignDetail campaignID={item.id} />);
  expect(
    await screen.findByRole("heading", { name: "Approved campaign" }),
  ).toBeVisible();
  expect(screen.getByText(/GHS 1000.00/)).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to campaigns" }),
  ).toHaveAttribute("href", "/admin/campaigns");
});

it("updates a deliverable approval and publish workflow", async () => {
  document.cookie = "jk_admin_csrf=token";
  const fetcher = vi.fn(
    async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") return Response.json(deliverable);
      return Response.json({ campaign: item, deliverables: [deliverable] });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignDetail campaignID={item.id} />);
  await screen.findByText("Launch reel");
  fireEvent.click(
    screen.getByRole("button", { name: "Launch reel workflow status" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "published" }));
  fireEvent.click(screen.getByRole("button", { name: "Launch reel approval" }));
  fireEvent.click(screen.getByRole("option", { name: "approved" }));
  fireEvent.change(screen.getByLabelText("Launch reel published URL"), {
    target: { value: "https://example.test/reel" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save deliverable" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/campaigns/${item.id}/deliverables/${deliverable.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"approval_status":"approved"'),
      }),
    ),
  );
  expect(
    await screen.findByText("Deliverable updated and audited."),
  ).toBeVisible();
});

it("changes campaign status and adds a deliverable", async () => {
  document.cookie = "jk_admin_csrf=token";
  const fetcher = vi.fn(
    async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") return Response.json(item);
      if (init?.method === "POST") return Response.json({}, { status: 201 });
      return Response.json({ campaign: item, deliverables: [] });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignDetail campaignID={item.id} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Campaign status" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "active" }));
  await screen.findByText("Campaign status updated.");

  expect(screen.queryByLabelText("Platform")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add deliverable" }));
  fireEvent.change(screen.getByLabelText("Title", { selector: "input" }), {
    target: { value: "Launch reel" },
  });
  fireEvent.change(screen.getByLabelText("Platform"), {
    target: { value: "Instagram" },
  });
  fireEvent.change(screen.getByLabelText("Format"), {
    target: { value: "video" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Due at" }));
  const dueDialog = screen.getByRole("dialog", { name: "Due at" });
  fireEvent.change(within(dueDialog).getByLabelText("Hour"), {
    target: { value: "12" },
  });
  fireEvent.change(within(dueDialog).getByLabelText("Minute"), {
    target: { value: "0" },
  });
  fireEvent.click(
    within(dueDialog)
      .getAllByRole("button", { name: "20" })
      .find((button) => button.dataset.inMonth === "true")!,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add deliverable" }));
  expect(
    await screen.findByText("Deliverable added and audited."),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    `/api/admin/campaigns/${item.id}/deliverables`,
    expect.objectContaining({ method: "POST" }),
  );
});

it("shows a safe failure message when the campaign cannot be opened", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  render(<CampaignDetail campaignID={item.id} />);
  expect(
    await screen.findByText(
      "This campaign could not be opened. Return to the campaign list and try again.",
    ),
  ).toBeVisible();
});
