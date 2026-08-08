import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { event } from "../events/test-fixture";
import type { PublicEvent, PublicTicketType } from "../events/types";
import { EventDetails } from "./event-details";

const ticket = (extra: Partial<PublicTicketType> = {}): PublicTicketType => ({
  ...event().tickets[0],
  ...extra,
});

const withPolicies = (extra: Partial<PublicEvent["policies"]>) =>
  event({ policies: { ...event().policies, ...extra } });

const tierCard = (name = "Approved ticket") =>
  screen.getByRole("article", { name });

it("renders the whole buying decision: what, when, where, price and one way in", () => {
  render(<EventDetails event={event()} />);

  expect(
    screen.getByRole("heading", { level: 1, name: "Approved event" }),
  ).toBeVisible();
  expect(screen.getByText("Approved summary")).toBeVisible();
  expect(screen.getByText("Approved description")).toBeVisible();

  // The date is stated twice on purpose (hero summary + venue panel), so a
  // visitor scrolled past the fold never has to scroll back for it.
  expect(screen.getAllByText(/Aug 10, 2026/).length).toBeGreaterThan(1);
  expect(screen.getAllByText("Approved venue")).toHaveLength(2);
  expect(screen.getByText("Approved address, Accra, GH")).toBeVisible();
  expect(screen.getByText("Africa/Accra")).toBeVisible();

  expect(screen.getByText("From GHS 100.00")).toBeVisible();
  expect(screen.getByText("1 ticket type published")).toBeVisible();
  expect(screen.getByRole("link", { name: "Buy tickets" })).toHaveAttribute(
    "href",
    "/tickets/checkout?event=approved-event",
  );

  expect(screen.getByText("Approved entry policy")).toBeVisible();
  expect(screen.getByText("Approved refund policy")).toBeVisible();
  expect(screen.getByText("Approved age guidance")).toBeVisible();
  expect(screen.getByText("Approved accessibility policy")).toBeVisible();
});

it("publishes the venue map and its accessibility note", () => {
  render(<EventDetails event={event()} />);

  expect(screen.getByRole("link", { name: "Open venue map" })).toHaveAttribute(
    "href",
    "https://maps.example.test/venue",
  );
  expect(
    screen.getByRole("heading", { name: "Venue accessibility" }),
  ).toBeVisible();
  expect(screen.getByText("Approved access details")).toBeVisible();
});

it("states price, remaining stock and order limits on an on-sale tier", () => {
  render(<EventDetails event={event()} />);
  const card = tierCard();

  expect(within(card).getByText("GHS 100.00")).toBeVisible();
  expect(within(card).getByText("Approved ticket details")).toBeVisible();
  // 100 capacity - 20 sold - 5 reserved. Reserved stock is not buyable, so
  // leaving it in the count would oversell the tier.
  expect(within(card).getByText("75 of 100 left")).toBeVisible();
  expect(within(card).getByText("1–4 per order")).toBeVisible();
  expect(within(card).getByText("Sales close")).toBeVisible();
  expect(
    within(card).getByRole("link", { name: "Buy Approved ticket" }),
  ).toHaveAttribute("href", "/tickets/checkout?event=approved-event");
});

it("sends a visitor with a choice to the tier list instead of picking one for them", () => {
  render(
    <EventDetails
      event={event({
        tickets: [ticket(), ticket({ name: "Second ticket", price: "80.00" })],
      })}
    />,
  );

  expect(
    screen.getByRole("link", { name: "Choose your ticket" }),
  ).toHaveAttribute("href", "#tickets");
  expect(screen.queryByRole("link", { name: "Buy tickets" })).toBeNull();
  expect(screen.getByText("2 ticket types published")).toBeVisible();
  // "From" has to track the cheapest published tier, not the first one.
  expect(screen.getByText("From GHS 80.00")).toBeVisible();
});

it.each([
  ["scheduled", "Tickets scheduled", "On sale Aug 1, 2026, 12:00 AM"],
  ["paused", "Sales paused", "Sales paused"],
  ["sale_ended", "Sales closed", "Sales closed"],
  ["sold_out", "Sold out", "Sold out"],
] as const)(
  "shows the %s tier state and refuses checkout for it",
  (availability, status, action) => {
    render(
      <EventDetails event={event({ tickets: [ticket({ availability })] })} />,
    );
    const card = tierCard();

    expect(within(card).getAllByText(status).length).toBeGreaterThan(0);
    expect(within(card).getByRole("button", { name: action })).toBeDisabled();
    expect(within(card).queryByRole("link")).toBeNull();
    expect(screen.queryByRole("link", { name: "Buy tickets" })).toBeNull();
  },
);

// The headline status is the first thing read; it has to reflect the event's
// own availability, not be hardcoded to the on-sale copy.
it.each([
  ["scheduled", "Tickets scheduled"],
  ["sale_ended", "Sales closed"],
  ["paused", "Sales paused"],
] as const)(
  "headlines a %s event with its own status",
  (availability, label) => {
    render(
      <EventDetails
        event={event({ availability, tickets: [ticket({ availability })] })}
      />,
    );

    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  },
);

it("still lets a visitor read tier states when nothing is buyable yet", () => {
  render(
    <EventDetails
      event={event({ tickets: [ticket({ availability: "scheduled" })] })}
    />,
  );

  expect(
    screen.getByRole("link", { name: "See ticket availability" }),
  ).toHaveAttribute("href", "#tickets");
});

it("treats an on-sale tier with nothing left as sold out", () => {
  render(
    <EventDetails
      event={event({
        availability: "sold_out",
        tickets: [ticket({ availability: "on_sale", sold: 95, reserved: 5 })],
      })}
    />,
  );
  const card = tierCard();

  // The API still says on_sale, but capacity - sold - reserved is zero, so
  // offering checkout here would sell a ticket that does not exist.
  expect(within(card).getAllByText("Sold out").length).toBeGreaterThan(0);
  expect(within(card).getByText("None left")).toBeVisible();
  expect(within(card).queryByRole("link")).toBeNull();

  // Both the tier control and the single hero call to action have to go dead.
  const soldOut = screen.getAllByRole("button", { name: "Sold out" });
  expect(soldOut).toHaveLength(2);
  soldOut.forEach((control) => expect(control).toBeDisabled());
  expect(screen.queryByRole("link", { name: /^Buy/ })).toBeNull();
});

it("keeps checkout shut when no checkout link has been published", () => {
  render(
    <EventDetails
      event={event({ tickets: [ticket({ checkout_href: undefined })] })}
    />,
  );
  const card = tierCard();

  expect(within(card).getByText("On sale")).toBeVisible();
  expect(
    within(card).getByRole("button", { name: "Checkout opening soon" }),
  ).toBeDisabled();
  expect(within(card).queryByRole("link")).toBeNull();
});

it("omits the map link, the access note and the accessibility policy when unpublished", () => {
  render(
    <EventDetails
      event={event({
        venue: {
          name: "Approved venue",
          address: "Approved address",
          city: "Accra",
          country_code: "GH",
        },
        policies: {
          refunds: "Approved refund policy",
          entry: "Approved entry policy",
          age_limit: 18,
        },
      })}
    />,
  );

  expect(screen.queryByRole("link", { name: "Open venue map" })).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Venue accessibility" }),
  ).toBeNull();
  expect(screen.queryByRole("heading", { name: "Accessibility" })).toBeNull();
  // Falls back to the numeric limit rather than dropping age guidance entirely.
  expect(screen.getByText("Minimum age 18")).toBeVisible();
});

it("says all ages are welcome when there is no age limit at all", () => {
  render(
    <EventDetails
      event={withPolicies({ age_guidance: undefined, age_limit: 0 })}
    />,
  );

  expect(screen.getByText("All ages welcome")).toBeVisible();
});

it("drops the about section rather than rendering an empty heading", () => {
  render(<EventDetails event={event({ description: "   " })} />);

  expect(
    screen.queryByRole("heading", { name: "About this event" }),
  ).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Venue and arrival" }),
  ).toBeVisible();
});

it("explains the empty ticket case instead of showing a dead call to action", () => {
  render(<EventDetails event={event({ tickets: [] })} />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "No published ticket types are available.",
  );
  expect(
    screen.getByRole("button", { name: "Tickets unavailable" }),
  ).toBeDisabled();
  expect(screen.getByText("Pricing to be announced")).toBeVisible();
  expect(
    screen.getByText("Ticket types for this date have not been published yet."),
  ).toBeVisible();
  expect(screen.queryByRole("article", { name: "Approved ticket" })).toBeNull();
});

it("never renders a NaN price or an invalid sales date at a visitor", () => {
  render(
    <EventDetails
      event={event({ tickets: [ticket({ price: "", sales_end: "" })] })}
    />,
  );

  expect(screen.getByText("Pricing to be announced")).toBeVisible();
  expect(within(tierCard()).getByText("Price on request")).toBeVisible();
  expect(within(tierCard()).getByText("To be confirmed")).toBeVisible();
});

it("marks demo media and demo provenance so it is never mistaken for live content", () => {
  render(<EventDetails event={event()} coverSrc="/demo/cover.jpg" usingDemo />);

  expect(screen.getByText("Demo event")).toBeVisible();
  expect(screen.getByText("Demo media — replace via CMS")).toBeVisible();
});

it("renders published cover art without the demo caption", () => {
  const { container } = render(
    <EventDetails event={event()} coverSrc="/media/cover.jpg" />,
  );

  expect(container.querySelector("img")).toHaveAttribute(
    "src",
    "/media/cover.jpg",
  );
  expect(screen.queryByText(/Demo media/)).toBeNull();
  expect(screen.getByText("Live event")).toBeVisible();
});
