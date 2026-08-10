import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  vi.unstubAllGlobals();
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
  { checkout_url: "https://pay.test", expires_at: "sometime soon" },
  { checkout_url: "not a url at all", expires_at: "2099-01-01T00:00:00Z" },
  { checkout_url: 42, expires_at: "2099-01-01T00:00:00Z" },
  "https://pay.test",
  null,
])("rejects unsafe or incomplete payment response %#", (value) => {
  expect(checkoutURL(value)).toBe("");
});

it("accepts a live https session URL", () => {
  expect(
    checkoutURL({
      checkout_url: "https://pay.example.test/session/abc",
      expires_at: "2099-01-01T00:00:00Z",
    }),
  ).toBe("https://pay.example.test/session/abc");
});

// The form is noValidate, so the handler is the only thing standing between an
// empty form and a pointless order request.
it("blocks submission until the buyer details and terms are complete", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);

  fireEvent.click(screen.getByRole("button", { name: "Reserve and continue" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Complete your name and email, then accept the ticket terms.",
  );
  expect(fetchMock).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "Ama Mensah" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "ama@example.test" },
  });
  // Name and email alone are not enough — the terms box is still unchecked.
  fireEvent.click(screen.getByRole("button", { name: "Reserve and continue" }));
  expect(fetchMock).not.toHaveBeenCalled();
});

it("trims the optional phone and clamps the quantity before ordering", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);

  const quantity = screen.getByLabelText("Quantity");
  fireEvent.change(quantity, { target: { value: "5000" } });
  expect(quantity).toHaveValue(1000);
  fireEvent.change(quantity, { target: { value: "0" } });
  expect(quantity).toHaveValue(1);
  fireEvent.change(quantity, { target: { value: "4" } });
  expect(quantity).toHaveValue(4);

  fireEvent.change(screen.getByLabelText(/Phone/), {
    target: { value: "  +233200000000  " },
  });
  fireEvent.change(screen.getByLabelText("Full name"), {
    target: { value: "  Ama Mensah  " },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: " ama@example.test " },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Reserve and continue" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
    buyer_name: "Ama Mensah",
    buyer_email: "ama@example.test",
    buyer_phone: "+233200000000",
    terms_version: "2026-08-05",
    items: [{ ticket_type_id: ticketTypeId, quantity: 4 }],
  });
});

it("locks the submit button and warns while the order is being created", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);
  completeForm();

  const button = await screen.findByRole("button", {
    name: "Reserving tickets…",
  });
  expect(button).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Do not close this page",
  );
});

it("reports an unusable order payload instead of starting a payment", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ reference: "not-a-reference" }), {
      status: 201,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);
  completeForm();

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The order service returned an invalid response.",
  );
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each([
  [409, "These tickets are no longer available in the requested quantity."],
  [410, "These tickets are no longer available in the requested quantity."],
  [422, "These tickets are no longer available in the requested quantity."],
  [500, "Checkout could not be started. Please try again."],
])("explains a %i from the order service", async (status, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status })),
  );
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);
  completeForm();

  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(
    screen.getByRole("button", { name: "Reserve and continue" }),
  ).toBeEnabled();
});

// The order exists at this point, so the reference has to stay on screen for the
// buyer to quote when the payment step is the thing that failed.
it("keeps the order reference visible when the payment step fails", async () => {
  const holdEnds = new Date(Date.now() + 600_000).toISOString();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/checkout")
        ? new Response(null, { status: 502 })
        : new Response(
            JSON.stringify({ ...receipt, hold_expires_at: holdEnds }),
            { status: 201 },
          ),
    ),
  );
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);
  completeForm();

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Checkout could not be started. Please try again.",
  );
  expect(screen.getByText("JKT-2026-ABC12345")).toBeInTheDocument();
  expect(screen.getByText(/GHS\s+120\.00/)).toBeInTheDocument();
});

// Guards the hold timer: a reservation that lapses mid-payment must stop
// pretending it is still valid.
// The only test that reaches expiry through the component's own timer rather
// than an already-past hold, so the clock is the thing under test.
//
// It used to give the hold 400ms of real time, which the assertions raced: on
// a loaded machine the reservation lapsed before the "Opening…" state
// rendered, the component jumped straight to expired, and the first assertion
// failed. Fake timers remove the race — the hold is long, and expiry happens
// because the test advances the clock, not because the machine was slow.
it("expires the hold if it lapses while the payment session is opening", async () => {
  // `shouldAdvanceTime` keeps Testing Library's polling running; without it
  // the `findBy*` helpers wait on timers that never move.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const holdEnds = new Date(Date.now() + 60_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith("/checkout")
          ? new Promise<Response>(() => {})
          : new Response(
              JSON.stringify({ ...receipt, hold_expires_at: holdEnds }),
              { status: 201 },
            ),
      ),
    );
    render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);
    completeForm();

    expect(
      await screen.findByRole("button", { name: "Opening secure payment…" }),
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001);
    });

    expect(screen.getByText("Your ticket hold has ended")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /secure payment/i }),
    ).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it("redirects the window itself when no navigate override is supplied", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { assign, href: "http://localhost/" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/checkout")
        ? new Response(
            JSON.stringify({
              checkout_url: "https://pay.example.test/session/abc",
              expires_at: "2099-08-05T20:25:00Z",
            }),
            { status: 201 },
          )
        : new Response(JSON.stringify(receipt), { status: 201 }),
    ),
  );
  render(<CheckoutForm eventId={eventId} ticketTypeId={ticketTypeId} />);
  completeForm();

  await waitFor(() =>
    expect(assign).toHaveBeenCalledWith("https://pay.example.test/session/abc"),
  );
});
