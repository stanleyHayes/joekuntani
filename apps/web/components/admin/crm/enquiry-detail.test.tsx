import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { EnquiryDetail } from "./enquiry-detail";

const enquiryID = crypto.randomUUID();

beforeEach(() => {
  Object.defineProperty(document, "cookie", {
    value: "jk_admin_csrf=token",
    writable: true,
  });
});

function stubTransport(listItems: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path.endsWith("/workflow"))
        return Response.json({
          notes: [],
          tasks: [],
          stage_history: [],
          attachments: [],
        });
      if (path.endsWith("/deliveries")) return Response.json({ items: [] });
      return Response.json({ items: listItems });
    }),
  );
}

it("heads the workflow with the enquiry reference", async () => {
  stubTransport([
    {
      id: enquiryID,
      reference: "JK-DETAIL",
      source: "web",
      enquiry_type: "event",
      summary: "",
      stage: "new",
      owner_id: "",
      contact_id: crypto.randomUUID(),
      organization_id: "",
      service_id: "",
    },
  ]);
  render(<EnquiryDetail enquiryID={enquiryID} />);

  expect(
    await screen.findByRole("heading", { name: "JK-DETAIL" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Back to enquiries" }),
  ).toHaveAttribute("href", "/admin/crm");
  expect(
    screen.getByRole("heading", { name: "Add follow-up task" }),
  ).toBeVisible();
});

it("still shows the workflow when the reference cannot be resolved", async () => {
  stubTransport([]);
  render(<EnquiryDetail enquiryID={enquiryID} />);

  expect(await screen.findByRole("heading", { name: "Enquiry" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Lead activity" })).toBeVisible();
});
