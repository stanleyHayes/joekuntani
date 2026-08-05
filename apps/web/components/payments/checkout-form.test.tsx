import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CheckoutForm, checkoutURL } from "./checkout-form";

const eventId = "11111111-1111-4111-8111-111111111111";
const ticketTypeId = "22222222-2222-4222-8222-222222222222";
const receipt = {
  reference: "JKT-2026-ABC12345",
  status: "pending",
  currency: "GHS",
  total: "120.00",
  hold_expires_at: "2099-08-05T20:30:00Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("crypto", { randomUUID: () => eventId });
});

function completeForm() {
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Ama Mensah" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "ama@example.test" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Reserve and continue" }));
}

it("fails closed when event or ticket selection is invalid", () => {
  render(<CheckoutForm eventId="approved-event" ticketTypeId="" />);
  expect(screen.getByRole("alert")).toHaveTextContent("incomplete");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("creates an order, reuses its access key, and redirects to safe checkout", async () => {
  const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push([input, init]);
      return requests.length === 1
        ? new Response(JSON.stringify(receipt), { status: 201 })
        : new Response(
            JSON.stringify({
              checkout_url: "https://pay.example.test/session/abc",
              expires_at: "2099-08-05T20:25:00Z",
            }),
            { status: 201 },
          );
    }),
  );
  const navigate = vi.fn();
  render(
    <CheckoutForm
      eventId={eventId}
      ticketTypeId={ticketTypeId}
      navigate={navigate}
    />,
  );
  completeForm();

  await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  expect(requests[0][0]).toBe("/api/public/ticket-orders");
  expect(requests[0][1]?.headers).toMatchObject({ "Idempotency-Key": eventId });
  expect(JSON.parse(String(requests[0][1]?.body))).toMatchObject({
    event_id: eventId,
    terms_accepted: true,
    items: [{ ticket_type_id: ticketTypeId, quantity: 1 }],
  });
  expect(requests[1][0]).toBe(
    "/api/public/ticket-orders/JKT-2026-ABC12345/checkout",
  );
  expect(requests[1][1]?.headers).toEqual({ "Order-Access-Key": eventId });
  expect(navigate).toHaveBeenCalledWith("https://pay.example.test/session/abc");
  expect(screen.getByRole("link", { name: /continue if/i })).toHaveAttribute(
    "href",
    "https://pay.example.test/session/abc",
  );
});

it("keeps the persisted access key across a retry", async () => {
  localStorage.setItem(
    `jk-ticket-checkout-v1:${eventId}:${ticketTypeId}`,
    ticketTypeId,
  );
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);
  completeForm();
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reserve and continue" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
    ticketTypeId,
  );
  expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
    ticketTypeId,
  );
});

it("renders an expired hold without starting payment", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ ...receipt, hold_expires_at: "2020-01-01T00:00:00Z" }),
        { status: 201 },
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);
  completeForm();
  expect(
    await screen.findByText("Your ticket hold has ended"),
  ).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([
  { checkout_url: "http://pay.test", expires_at: "2099-01-01T00:00:00Z" },
  {
    checkout_url: "https://user:pass@pay.test",
    expires_at: "2099-01-01T00:00:00Z",
  },
  { checkout_url: "https://pay.test", expires_at: "2020-01-01T00:00:00Z" },
  { checkout_url: "https://pay.test" },
  null,
])("rejects unsafe or incomplete payment response %#", (value) => {
  expect(checkoutURL(value)).toBe("");
});
