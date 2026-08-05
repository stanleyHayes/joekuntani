import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
it("loads campaign financials and creates an audited campaign", async () => {
  document.cookie = "jk_admin_csrf=token";
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(item.id))
        return Response.json({ campaign: item, deliverables: [] });
      if (init?.method === "POST") return Response.json(item, { status: 201 });
      return Response.json({ items: [item] });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignWorkspace />);
  expect(await screen.findByText("Approved campaign")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Approved campaign/ }));
  expect(await screen.findByText(/GHS 1000.00/)).toBeVisible();
  for (const [label, value] of [
    ["enquiry id", item.enquiry_id],
    ["organization id", item.organization_id],
    ["title", "New campaign"],
    ["objective", "Objective"],
    ["starts on", "2026-08-10"],
    ["ends on", "2026-09-10"],
    ["fee", "200"],
    ["expenses", "10"],
    ["platforms", "Instagram"],
    ["results", "Reach=1000"],
    ["asset ids", "10000000-0000-4000-8000-000000000003"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/campaigns",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "token" }),
      }),
    ),
  );
  expect(
    await screen.findByText("Campaign created and audited."),
  ).toBeVisible();
});

it("updates a deliverable approval and publish workflow", async () => {
  document.cookie = "jk_admin_csrf=token";
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
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") return Response.json(deliverable);
      if (url.endsWith(item.id))
        return Response.json({ campaign: item, deliverables: [deliverable] });
      return Response.json({ items: [item] });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: /Approved campaign/ }),
  );
  await screen.findByText("Launch reel");
  fireEvent.change(screen.getByLabelText("Launch reel workflow status"), {
    target: { value: "published" },
  });
  fireEvent.change(screen.getByLabelText("Launch reel approval"), {
    target: { value: "approved" },
  });
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
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") return Response.json(item);
      if (init?.method === "POST") return Response.json({}, { status: 201 });
      if (url.endsWith(item.id))
        return Response.json({ campaign: item, deliverables: [] });
      return Response.json({ items: [item] });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignWorkspace />);
  fireEvent.click(
    await screen.findByRole("button", { name: /Approved campaign/ }),
  );
  fireEvent.change(await screen.findByLabelText("Status"), {
    target: { value: "active" },
  });
  await screen.findByText("Campaign status updated.");

  fireEvent.change(screen.getByLabelText("Title", { selector: "input" }), {
    target: { value: "Launch reel" },
  });
  fireEvent.change(screen.getByLabelText("Platform"), {
    target: { value: "Instagram" },
  });
  fireEvent.change(screen.getByLabelText("Format"), {
    target: { value: "video" },
  });
  fireEvent.change(screen.getByLabelText("Due at"), {
    target: { value: "2026-08-20T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add deliverable" }));
  expect(
    await screen.findByText("Deliverable added and audited."),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    `/api/admin/campaigns/${item.id}/deliverables`,
    expect.objectContaining({ method: "POST" }),
  );
});

it("shows safe failure messages when loading or creating fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(new Response(null, { status: 422 }));
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignWorkspace />);
  expect(await screen.findByText("Campaigns are unavailable.")).toBeVisible();
  for (const [label, value] of [
    ["enquiry id", item.enquiry_id],
    ["organization id", item.organization_id],
    ["title", "New campaign"],
    ["objective", "Objective"],
    ["starts on", "2026-08-10"],
    ["ends on", "2026-09-10"],
    ["fee", "200"],
    ["expenses", "10"],
    ["platforms", "Instagram"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));
  expect(await screen.findByText("Campaign was not saved.")).toBeVisible();
});
