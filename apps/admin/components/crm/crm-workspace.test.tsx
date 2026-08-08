import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CRMWorkspace } from "./crm-workspace";

beforeEach(() => {
  Object.defineProperty(document, "cookie", {
    value: "jk_admin_csrf=token",
    writable: true,
  });
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});

it("loads, filters and advances the audited enquiry pipeline", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        items: [
          {
            id: crypto.randomUUID(),
            reference: "JK-2026-ABC123",
            source: "referral",
            enquiry_type: "brand",
            summary: "Launch",
            stage: "new",
            owner_id: "",
            contact_id: crypto.randomUUID(),
            organization_id: "",
            service_id: crypto.randomUUID(),
          },
        ],
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<CRMWorkspace />);
  expect(await screen.findByText("JK-2026-ABC123")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Stage for JK-2026-ABC123" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "Reviewing" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/stage"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": "token" }),
      }),
    ),
  );
});

it("renders fail-closed loading errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<CRMWorkspace />);
  expect(await screen.findByText("CRM records are unavailable.")).toBeVisible();
});

it("links to the tools page carrying the active filters, and to each enquiry", async () => {
  const enquiryID = crypto.randomUUID();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        items: [
          {
            id: enquiryID,
            reference: "JK-LINKED",
            source: "web",
            enquiry_type: "event",
            summary: "",
            stage: "new",
            owner_id: "",
            contact_id: crypto.randomUUID(),
            organization_id: "",
            service_id: "",
          },
        ],
      }),
    ),
  );
  render(<CRMWorkspace />);
  await screen.findByText("JK-LINKED");

  expect(
    screen.getByRole("link", { name: "Open notes, tasks and proposals" }),
  ).toHaveAttribute("href", `/admin/crm/enquiries/${enquiryID}`);
  expect(screen.getByRole("link", { name: "Open CRM tools" })).toHaveAttribute(
    "href",
    "/admin/crm/tools",
  );

  // A saved view records the filters the list was using, so they have to
  // survive the trip to the tools page.
  fireEvent.change(screen.getByLabelText("Search"), {
    target: { value: "launch" },
  });
  fireEvent.change(screen.getByLabelText("Owner ID"), {
    target: { value: "staff-1" },
  });
  expect(screen.getByRole("link", { name: "Open CRM tools" })).toHaveAttribute(
    "href",
    "/admin/crm/tools?q=launch&owner_id=staff-1",
  );
});

it("assigns owners, exports privacy data and soft deletes", async () => {
  const enquiryID = crypto.randomUUID();
  const contactID = crypto.randomUUID();
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/export"))
      return Response.json({ contact: { id: contactID } });
    if (init?.method) return Response.json({});
    if (path.includes("/enquiries"))
      return Response.json({
        items: [
          {
            id: enquiryID,
            reference: "JK-PRIVACY",
            source: "web",
            enquiry_type: "event",
            summary: "",
            stage: "new",
            owner_id: "",
            contact_id: contactID,
            organization_id: "",
            service_id: "",
          },
        ],
      });
    return Response.json({ items: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:privacy");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  render(<CRMWorkspace />);
  await screen.findByText("JK-PRIVACY");

  fireEvent.change(screen.getByLabelText("Owner for JK-PRIVACY"), {
    target: { value: crypto.randomUUID() },
  });
  fireEvent.blur(screen.getByLabelText("Owner for JK-PRIVACY"));
  fireEvent.click(screen.getByRole("button", { name: "Export contact data" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete personal data" }));
  fireEvent.click(screen.getByRole("button", { name: "Soft delete enquiry" }));

  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/crm/contacts/${contactID}/export`,
      expect.anything(),
    ),
  );
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/owner"),
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/privacy-delete"),
    expect.objectContaining({ method: "POST" }),
  );
  expect(fetcher).toHaveBeenCalledWith(
    `/api/admin/crm/enquiries/${enquiryID}`,
    expect.objectContaining({ method: "DELETE" }),
  );
});
