import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignEditor } from "./campaign-editor";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  vi.unstubAllGlobals();
  router.push.mockReset();
  router.refresh.mockReset();
  document.cookie = "jk_admin_csrf=; Max-Age=0";
});

const entries: [string, string][] = [
  ["Enquiry ID", "10000000-0000-4000-8000-000000000002"],
  ["Organization ID", "10000000-0000-4000-8000-000000000003"],
  ["Campaign title", "New campaign"],
  ["Objective", "Objective"],
  ["Start date", "2026-08-10"],
  ["End date", "2026-09-10"],
  ["Fee", "200"],
  ["Expenses", "10"],
  ["Platforms", "Instagram"],
  ["Results", "Reach=1000"],
  ["Asset IDs", "10000000-0000-4000-8000-000000000003"],
];

function fill() {
  for (const [label, value] of entries)
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

it("creates an audited campaign and returns to the list", async () => {
  document.cookie = "jk_admin_csrf=token";
  const fetcher = vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Response
  >(() => Response.json({}, { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  render(<CampaignEditor />);
  fill();
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
  const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(body.status).toBe("draft");
  expect(body.platforms).toEqual(["Instagram"]);
  expect(body.results).toEqual([{ label: "Reach", value: "1000" }]);
  expect(body.fee).toEqual({ amount: "200", currency: "GHS" });
  expect(body.expenses).toEqual({ amount: "10", currency: "GHS" });
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/campaigns"));
});

it("keeps the draft on the page when the campaign is rejected", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 422 })),
  );
  render(<CampaignEditor />);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Create campaign" }));
  expect(await screen.findByText("Campaign was not saved.")).toBeVisible();
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Campaign title")).toHaveValue("New campaign");
});
