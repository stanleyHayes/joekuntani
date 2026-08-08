import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupportButton } from "./support-button";

type SupportOptions = {
  enabled: boolean;
  currency: string;
  presets: string[];
  min_amount: string;
  max_amount: string;
};

const liveOptions: SupportOptions = {
  enabled: true,
  currency: "GHS",
  presets: ["10.00", "25.00", "60.00"],
  min_amount: "5.00",
  max_amount: "9000.00",
};

const checkoutURL = "https://pay.example.test/session/abc";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Route = () => Promise<Response> | Response;
type Fetcher = ReturnType<typeof stubFetch>;

/** Routes the two endpoints the panel talks to; defaults keep payments live. */
function stubFetch(routes: { options?: Route; checkout?: Route } = {}) {
  const fetcher = vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >(async (input) => {
    const url = String(input);
    if (url.includes("/support/options")) {
      return routes.options ? routes.options() : json(liveOptions);
    }
    if (url.includes("/support/checkout")) {
      return routes.checkout ? routes.checkout() : json({ checkout_url: checkoutURL }, 201);
    }
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const checkoutCalls = (fetcher: Fetcher) =>
  fetcher.mock.calls.filter(([url]) => String(url).includes("/support/checkout"));

const checkoutBody = (fetcher: Fetcher) =>
  JSON.parse(String(checkoutCalls(fetcher)[0]?.[1]?.body));

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  assign = vi.fn();
  // jsdom's Location members are unforgeable, so the whole global is replaced
  // rather than spied on; the component redirects via `window.location.assign`.
  vi.stubGlobal("location", {
    assign,
    href: "http://localhost/",
    origin: "http://localhost",
    pathname: "/",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Opens the panel and waits for the modal itself (payments may be off). */
async function openPanel() {
  render(<SupportButton />);
  fireEvent.click(screen.getByRole("button", { name: "Support the artist" }));
  return screen.findByRole("dialog", { name: "Back the work directly" });
}

/** Opens the panel and waits for the live giving form. */
async function openForm() {
  await openPanel();
  await screen.findByRole("button", { name: "Continue to payment" });
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));

function setEmail(value: string) {
  fireEvent.change(screen.getByLabelText("Email for your receipt"), {
    target: { value },
  });
}

describe("SupportButton trigger", () => {
  it("shows only the trigger and asks the API for nothing until it is pressed", () => {
    const fetcher = stubFetch();
    render(<SupportButton />);

    expect(screen.getByRole("button", { name: "Support the artist" })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The options endpoint is per-open, not per-page-render: a trigger sitting
    // in the header and the footer must not cost two requests on every view.
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("takes a custom label and adds a styling hook for the ghost variant", () => {
    stubFetch();
    render(
      <>
        <SupportButton className="solid-extra" />
        <SupportButton variant="ghost" label="Chip in" className="ghost-extra" />
      </>,
    );

    const solid = screen.getByRole("button", { name: "Support the artist" });
    const ghost = screen.getByRole("button", { name: "Chip in" });
    const solidTokens = solid.className.split(" ");
    const ghostTokens = ghost.className.split(" ");

    // Caller-supplied classes must survive the className join, and `ghost` must
    // contribute exactly one extra class rather than replacing the base one.
    expect(solidTokens).toContain("solid-extra");
    expect(ghostTokens).toContain("ghost-extra");
    expect(ghostTokens.filter((token) => token !== "ghost-extra")).toHaveLength(
      solidTokens.filter((token) => token !== "solid-extra").length + 1,
    );
  });

  it("opens a labelled, focused modal", async () => {
    stubFetch();
    const dialog = await openPanel();

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveTextContent("Give once");
  });
});

describe("support options", () => {
  it("falls back to a payments-off panel when the options request rejects", async () => {
    stubFetch({ options: () => Promise.reject(new Error("offline")) });
    await openPanel();

    expect(
      await screen.findByText(/Online contributions aren't switched on yet/),
    ).toBeVisible();
    // A dead options endpoint must not leave a form that posts into the void.
    expect(screen.queryByRole("button", { name: "Continue to payment" })).toBeNull();
    expect(screen.getByRole("link", { name: "Make an enquiry" })).toHaveAttribute(
      "href",
      "/book",
    );
  });

  it("treats a failed options response as payments-off", async () => {
    stubFetch({ options: () => new Response(null, { status: 503 }) });
    await openPanel();

    expect(
      await screen.findByText(/Online contributions aren't switched on yet/),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps the panel off when the API says giving is disabled", async () => {
    stubFetch({ options: () => json({ ...liveOptions, enabled: false }) });
    await openPanel();

    expect(
      await screen.findByText(/Online contributions aren't switched on yet/),
    ).toBeVisible();
  });

  it("renders every tier and seeds the amount from the second one", async () => {
    stubFetch();
    await openForm();

    expect(screen.getByRole("group", { name: "Choose an amount" })).toBeVisible();
    for (const preset of liveOptions.presets) {
      expect(screen.getByRole("button", { name: `GHS ${preset}` })).toBeVisible();
    }
    // The middle tier is the suggested default, not the cheapest one.
    expect(screen.getByLabelText("Amount in GHS")).toHaveValue("25.00");
    expect(screen.getByRole("button", { name: "GHS 25.00" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("uses the only preset when the API offers a single tier", async () => {
    stubFetch({ options: () => json({ ...liveOptions, presets: ["15.00"] }) });
    await openForm();

    // `presets[1] ?? presets[0]` — a one-tier config must not seed `undefined`
    // into the amount field and turn it into an uncontrolled input.
    expect(screen.getByLabelText("Amount in GHS")).toHaveValue("15.00");
  });

  it("keeps its built-in default amount when the API returns no presets", async () => {
    stubFetch({ options: () => json({ ...liveOptions, presets: [] }) });
    await openForm();

    expect(screen.getByLabelText("Amount in GHS")).toHaveValue("50.00");
    expect(screen.queryByRole("button", { name: /^GHS / })).toBeNull();
  });

  it("takes the currency from the API rather than the built-in fallback", async () => {
    stubFetch({ options: () => json({ ...liveOptions, currency: "USD" }) });
    await openForm();

    expect(screen.getByLabelText("Amount in USD")).toBeVisible();
    expect(screen.getByRole("button", { name: "USD 25.00" })).toBeVisible();
  });
});

describe("amount and donor fields", () => {
  it("moves the pressed state and the amount when another tier is chosen", async () => {
    stubFetch();
    await openForm();

    fireEvent.click(screen.getByRole("button", { name: "GHS 60.00" }));

    expect(screen.getByLabelText("Amount in GHS")).toHaveValue("60.00");
    expect(screen.getByRole("button", { name: "GHS 60.00" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "GHS 25.00" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("drops the pressed state once a custom amount is typed", async () => {
    stubFetch();
    await openForm();

    fireEvent.change(screen.getByLabelText("Amount in GHS"), {
      target: { value: "37.50" },
    });

    // A hand-typed amount that matches no tier must leave every tier unpressed.
    for (const preset of liveOptions.presets) {
      expect(screen.getByRole("button", { name: `GHS ${preset}` })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  it("posts the typed amount with trimmed donor details and the API currency", async () => {
    const fetcher = stubFetch();
    await openForm();

    fireEvent.change(screen.getByLabelText("Amount in GHS"), {
      target: { value: "42.00" },
    });
    setEmail("  ama@example.test  ");
    fireEvent.change(screen.getByLabelText("Your name (optional)"), {
      target: { value: "  Ama Mensah  " },
    });
    fireEvent.change(screen.getByLabelText("Message (optional)"), {
      target: { value: "  Keep going  " },
    });
    submit();

    await waitFor(() => expect(checkoutCalls(fetcher)).toHaveLength(1));
    expect(checkoutBody(fetcher)).toEqual({
      amount: "42.00",
      currency: "GHS",
      name: "Ama Mensah",
      email: "ama@example.test",
      message: "Keep going",
      anonymous: false,
    });
    expect(checkoutCalls(fetcher)[0]?.[1]?.method).toBe("POST");
  });

  it("hides and withholds the name for an anonymous gift", async () => {
    const fetcher = stubFetch();
    await openForm();

    fireEvent.change(screen.getByLabelText("Your name (optional)"), {
      target: { value: "Ama Mensah" },
    });
    setEmail("ama@example.test");
    fireEvent.click(screen.getByRole("checkbox"));

    expect(screen.queryByLabelText("Your name (optional)")).toBeNull();
    submit();

    await waitFor(() => expect(checkoutCalls(fetcher)).toHaveLength(1));
    // The already-typed name must not ride along once anonymity is ticked.
    expect(checkoutBody(fetcher)).toMatchObject({ name: "", anonymous: true });
  });

  it("brings the name field back when anonymity is unticked", async () => {
    stubFetch();
    await openForm();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByLabelText("Your name (optional)")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByLabelText("Your name (optional)")).toBeVisible();
  });

  it("will not start a checkout without a valid receipt email or an amount", async () => {
    const fetcher = stubFetch();
    await openForm();

    // Both fields are `required`, so the browser blocks the submit before any
    // money flow starts. Dropping either attribute would leak an unusable
    // order into the payment provider.
    submit();
    expect(checkoutCalls(fetcher)).toHaveLength(0);

    setEmail("not-an-email");
    submit();
    expect(checkoutCalls(fetcher)).toHaveLength(0);

    setEmail("ama@example.test");
    fireEvent.change(screen.getByLabelText("Amount in GHS"), {
      target: { value: "" },
    });
    submit();
    expect(checkoutCalls(fetcher)).toHaveLength(0);
  });
});

describe("checkout", () => {
  it("sends the visitor to the checkout URL the API returns", async () => {
    stubFetch();
    await openForm();
    setEmail("ama@example.test");

    submit();

    await waitFor(() => expect(assign).toHaveBeenCalledWith(checkoutURL));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("quotes the accepted range from the API when the amount is rejected", async () => {
    stubFetch({
      options: () =>
        json({
          ...liveOptions,
          currency: "USD",
          min_amount: "2.00",
          max_amount: "500.00",
        }),
      checkout: () => json({}, 422),
    });
    await openForm();
    setEmail("ama@example.test");

    submit();

    // The limits must come from the live options, not the hard-coded fallback
    // of GHS 5.00–50000.00, or the advice contradicts the server.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter an amount between USD 2.00 and USD 500.00, and a valid email address.",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("reports an outage rather than a validation problem for other failures", async () => {
    stubFetch({ checkout: () => new Response(null, { status: 500 }) });
    await openForm();
    setEmail("ama@example.test");

    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Support payments are temporarily unavailable. Please try again shortly.",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("refuses to navigate when a successful response omits the checkout URL", async () => {
    stubFetch({ checkout: () => json({ reference: "SUP-1" }, 201) });
    await openForm();
    setEmail("ama@example.test");

    submit();

    // A 2xx with no URL used to be indistinguishable from success; navigating
    // to `undefined` would strand the giver on a blank page.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Support payments are temporarily unavailable.",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("recovers from a network failure and clears the error on a successful retry", async () => {
    const checkout = vi
      .fn<Route>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(json({ checkout_url: checkoutURL }, 201));
    const fetcher = stubFetch({ checkout });
    await openForm();
    setEmail("ama@example.test");

    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Support payments are temporarily unavailable.",
    );
    // `finally` must clear the pending flag, otherwise the retry is impossible.
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeEnabled();

    submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith(checkoutURL));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(checkoutCalls(fetcher)).toHaveLength(2);
  });

  it("locks the panel while the checkout request is in flight", async () => {
    const gate = deferred<Response>();
    const fetcher = stubFetch({ checkout: () => gate.promise });
    await openForm();
    setEmail("ama@example.test");

    submit();

    const pending = await screen.findByRole("button", {
      name: /Opening secure checkout/,
    });
    expect(pending).toBeDisabled();

    // Closing mid-flight would drop a payment the visitor has already started.
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close support panel" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(checkoutCalls(fetcher)).toHaveLength(1);

    gate.resolve(new Response(null, { status: 503 }));
    await screen.findByRole("alert");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("dismissing the panel", () => {
  it("closes on Escape", async () => {
    stubFetch();
    await openForm();

    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes from its labelled close control", async () => {
    stubFetch();
    await openForm();

    fireEvent.click(screen.getByRole("button", { name: "Close support panel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on a backdrop press but not on a press inside the panel", async () => {
    stubFetch();
    const dialog = await openPanel();
    await screen.findByRole("button", { name: "Continue to payment" });

    // Presses that bubble up from the panel itself must not dismiss it, or
    // dragging to select text inside the form would close the dialog.
    fireEvent.mouseDown(dialog);
    fireEvent.mouseDown(screen.getByLabelText("Amount in GHS"));
    expect(screen.getByRole("dialog")).toBeVisible();

    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stops listening for Escape once the panel is closed", async () => {
    stubFetch();
    await openForm();

    fireEvent.click(screen.getByRole("button", { name: "Close support panel" }));
    // A leaked document listener would throw on the second Escape by calling
    // `onClose` for an unmounted dialog.
    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores an options response that lands after the panel is closed", async () => {
    const gate = deferred<void>();
    stubFetch({
      options: async () => {
        await gate.promise;
        return json(liveOptions);
      },
    });
    await openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close support panel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    gate.resolve();
    await new Promise((settle) => setTimeout(settle, 0));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Re-opening must fetch again and build the form from the fresh response
    // rather than from anything the abandoned request left behind.
    fireEvent.click(screen.getByRole("button", { name: "Support the artist" }));
    expect(await screen.findByLabelText("Amount in GHS")).toHaveValue("25.00");
  });
});
