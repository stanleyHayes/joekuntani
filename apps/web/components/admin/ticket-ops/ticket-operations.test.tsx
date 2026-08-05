import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TicketOperations } from "./ticket-operations";
beforeEach(() =>
  Object.defineProperty(document, "cookie", {
    value: "jk_admin_csrf=token",
    writable: true,
  }),
);
it("filters orders and submits an idempotent audited refund", async () => {
  const id = crypto.randomUUID();
  const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
    init?.method
      ? Response.json({}, { status: 202 })
      : Response.json({
          items: [
            {
              id,
              reference: "JKT-2026-ABC12345",
              buyer_email: "buyer@example.test",
              currency: "GHS",
              total: "100.00",
              refunded: "0.00",
              status: "paid",
            },
          ],
          summary: [
            {
              currency: "GHS",
              orders: 1,
              revenue: "100.00",
              fees: "5.00",
              refunded: "0.00",
              net: "95.00",
            },
          ],
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<TicketOperations />);
  expect(await screen.findByText("JKT-2026-ABC12345")).toBeVisible();
  fireEvent.change(
    screen.getByLabelText("Refund amount for JKT-2026-ABC12345"),
    { target: { value: "25.00" } },
  );
  fireEvent.change(
    screen.getByLabelText("Refund reason for JKT-2026-ABC12345"),
    { target: { value: "Customer request" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve refund" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/refund"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": expect.any(String),
          "X-CSRF-Token": "token",
        }),
      }),
    ),
  );
});
it("fails closed when operations are unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<TicketOperations />);
  expect(
    await screen.findByText("Ticket operations are unavailable."),
  ).toBeVisible();
});
it("filters, resends, voids, exports and confirms event cancellation", async () => {
  const id = crypto.randomUUID();
  const fetcher = vi.fn(async (_path: string, init?: RequestInit) =>
    init?.method
      ? new Response(null, { status: 204 })
      : Response.json({
          items: [
            {
              id,
              reference: "JKT-2026-ABC12345",
              event_id: id,
              buyer_email: "buyer@example.test",
              currency: "GHS",
              total: "100.00",
              refunded: "0.00",
              status: "paid",
            },
          ],
          summary: [],
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  vi.spyOn(window, "prompt").mockReturnValue("Event cancelled");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<TicketOperations />);
  await screen.findByText("JKT-2026-ABC12345");
  fireEvent.change(screen.getByLabelText("Event ID"), {
    target: { value: id },
  });
  fireEvent.change(screen.getByLabelText("Status"), {
    target: { value: "partially_refunded" },
  });
  fireEvent.change(screen.getByLabelText("Buyer or reference"), {
    target: { value: "ABC12345" },
  });
  fireEvent.change(screen.getByLabelText("From"), {
    target: { value: "2026-08-01" },
  });
  fireEvent.change(screen.getByLabelText("To"), {
    target: { value: "2026-08-31" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(
    screen.getByRole("link", { name: "Export attendee CSV" }),
  ).toHaveAttribute("href", expect.stringContaining(id));
  fireEvent.click(screen.getByRole("button", { name: "Resend tickets" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel event" }));
  fireEvent.change(screen.getByLabelText("Ticket ID"), {
    target: { value: id },
  });
  fireEvent.change(screen.getByLabelText("Void reason"), {
    target: { value: "Duplicate ticket" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Void ticket" }));
  await waitFor(() => {
    const paths = fetcher.mock.calls.map(([path]) => String(path));
    expect(paths.some((path) => path.includes("/resend"))).toBe(true);
    expect(paths.some((path) => path.includes("/cancel"))).toBe(true);
    expect(paths.some((path) => path.includes("/void"))).toBe(true);
    expect(paths.some((path) => path.includes("partially_refunded"))).toBe(
      true,
    );
  });
});
