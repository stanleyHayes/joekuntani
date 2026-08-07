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
    .mockResolvedValueOnce(Response.json({ items: [] }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({ items: [] }))
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

it("creates directory records and finds normalized contacts", async () => {
  const contactID = crypto.randomUUID();
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.includes("/organizations/lookup")) {
      return Response.json({
        id: crypto.randomUUID(),
        name: "Kuntani Group",
        website: "https://example.com",
      });
    }
    if (path.includes("/contacts/lookup")) {
      return Response.json({
        id: contactID,
        name: "Ama Mensah",
        email: "ama@example.com",
      });
    }
    if (init?.method === "POST") return Response.json({}, { status: 201 });
    return Response.json({ items: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<CRMWorkspace />);
  await screen.findByText("Nobody has asked yet");

  expect(
    screen.queryByRole("dialog", { name: "CRM tools" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open CRM tools" }));
  const organizationForm = screen
    .getByRole("heading", { name: "Add organization" })
    .closest("form")!;
  fireEvent.change(organizationForm.querySelector('input[name="name"]')!, {
    target: { value: "Kuntani Group" },
  });
  fireEvent.submit(organizationForm);
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/crm/organizations",
      expect.objectContaining({ method: "POST" }),
    ),
  );

  const organizationLookup = screen
    .getByRole("heading", { name: "Find organization" })
    .closest("form")!;
  fireEvent.change(organizationLookup.querySelector('input[name="name"]')!, {
    target: { value: "  KUNTANI   GROUP  " },
  });
  fireEvent.submit(organizationLookup);
  expect(
    await screen.findByText(
      "Matching organization found using its canonical name.",
    ),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/organizations/lookup?name="),
    expect.anything(),
  );

  const contactForm = screen
    .getByRole("heading", { name: "Add contact" })
    .closest("form")!;
  fireEvent.change(contactForm.querySelector('input[name="name"]')!, {
    target: { value: "Ama Mensah" },
  });
  fireEvent.change(contactForm.querySelector('input[name="email"]')!, {
    target: { value: "AMA@example.com" },
  });
  fireEvent.submit(contactForm);
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/crm/contacts",
      expect.objectContaining({ method: "POST" }),
    ),
  );

  const lookupForm = screen
    .getByRole("heading", { name: "Find contact" })
    .closest("form")!;
  fireEvent.change(lookupForm.querySelector('input[name="email"]')!, {
    target: { value: " AMA@example.com " },
  });
  fireEvent.submit(lookupForm);
  expect(
    await screen.findByText("Matching contact found using normalized details."),
  ).toBeVisible();
  expect(screen.getByText("Ama Mensah")).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining("/api/admin/crm/contacts/lookup?email="),
    expect.anything(),
  );
});

it("saves views, assigns owners, exports privacy data and soft deletes", async () => {
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

  expect(screen.queryByLabelText("Saved view name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open CRM tools" }));
  fireEvent.change(screen.getByLabelText("Saved view name"), {
    target: { value: "New enquiries" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
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
    "/api/admin/crm/views",
    expect.objectContaining({ method: "POST" }),
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
