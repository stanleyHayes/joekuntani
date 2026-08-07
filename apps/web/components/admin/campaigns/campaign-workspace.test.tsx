import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  expect(
    screen.queryByRole("dialog", { name: "New campaign" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Approved campaign/ }));
  const detail = await screen.findByRole("dialog", {
    name: "Approved campaign",
  });
  expect(within(detail).getByText(/GHS 1000.00/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  fireEvent.click(screen.getByRole("button", { name: "Add campaign" }));
  for (const [label, value] of [
    ["Enquiry ID", item.enquiry_id],
    ["Organization ID", item.organization_id],
    ["Campaign title", "New campaign"],
    ["Objective", "Objective"],
    ["Start date", "2026-08-10"],
    ["End date", "2026-09-10"],
    ["Fee", "200"],
    ["Expenses", "10"],
    ["Platforms", "Instagram"],
    ["Results", "Reach=1000"],
    ["Asset IDs", "10000000-0000-4000-8000-000000000003"],
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

it("shows safe failure messages when loading or creating fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(new Response(null, { status: 422 }));
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignWorkspace />);
  expect(
    await screen.findByText("Joe’s campaign records could not be loaded."),
  ).toBeVisible();
  expect(
    screen.queryByRole("dialog", { name: "New campaign" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add campaign" }));
  for (const [label, value] of [
    ["Enquiry ID", item.enquiry_id],
    ["Organization ID", item.organization_id],
    ["Campaign title", "New campaign"],
    ["Objective", "Objective"],
    ["Start date", "2026-08-10"],
    ["End date", "2026-09-10"],
    ["Fee", "200"],
    ["Expenses", "10"],
    ["Platforms", "Instagram"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));
  expect(await screen.findByText("Campaign was not saved.")).toBeVisible();
});
