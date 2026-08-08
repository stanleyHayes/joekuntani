import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CRMTools } from "./crm-tools";

beforeEach(() => {
  Object.defineProperty(document, "cookie", {
    value: "jk_admin_csrf=token",
    writable: true,
  });
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
  render(<CRMTools query="" stage="" owner="" />);
  await screen.findByText("0 saved views");

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

it("saves the filters the pipeline list arrived with", async () => {
  const fetcher = vi.fn(async () => Response.json({ items: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<CRMTools query="launch" stage="qualified" owner="staff-1" />);
  expect(
    await screen.findByText(
      'Saves the filters the list was using: search "launch", stage Qualified, owner staff-1.',
    ),
  ).toBeVisible();

  fireEvent.change(screen.getByLabelText("Saved view name"), {
    target: { value: "New enquiries" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save current view" }));

  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/crm/views",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "New enquiries",
          filter: {
            stages: ["qualified"],
            owner_id: "staff-1",
            query: "launch",
          },
        }),
      }),
    ),
  );
});

it("never reports a saved view count it could not read", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<CRMTools query="" stage="" owner="" />);
  expect(await screen.findByText("Saved view count unavailable")).toBeVisible();
});
