import { render, screen } from "@testing-library/react";
import { TicketConfirmation } from "./ticket-confirmation";

const reference = "JKT-2026-ABC12345";

beforeEach(() => vi.restoreAllMocks());

it("fails closed for an incomplete secure link", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<TicketConfirmation reference={reference} access="" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("incomplete");
  expect(fetcher).not.toHaveBeenCalled();
});

it("shows masked order details and one downloadable bearer per admission", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          reference,
          status: "paid",
          buyer_email_masked: "a***@example.test",
          access_expires_at: "2026-09-05T00:00:00Z",
          tickets: [
            {
              id: "one",
              ticket_type_id: "type",
              status: "valid",
              qr_bearer: "jkt1.one.signature",
            },
            {
              id: "two",
              ticket_type_id: "type",
              status: "valid",
              qr_bearer: "jkt1.two.signature",
            },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
  render(<TicketConfirmation reference={reference} access="private-access" />);
  expect(
    await screen.findByRole("heading", { name: "Your tickets" }),
  ).toBeVisible();
  expect(screen.getByText(/a\*\*\*@example.test/)).toBeVisible();
  expect(screen.queryByText(/buyer@example/)).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Download ticket" })).toHaveLength(
    2,
  );
  expect(screen.getAllByLabelText(/QR ticket bearer/)).toHaveLength(2);
});

it("does not expose API failure details", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("secret", { status: 401 })),
  );
  render(<TicketConfirmation reference={reference} access="bad-token" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  expect(screen.queryByText("secret")).not.toBeInTheDocument();
});
