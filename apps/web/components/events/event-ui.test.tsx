import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EventCard, ScheduledEventBanner, TicketCard } from "./event-ui";
import { event } from "./test-fixture";

it("renders published event and scheduled banner with contextual links", () => {
  const approved = event();
  render(
    <>
      <ScheduledEventBanner event={approved} />
      <EventCard event={approved} />
    </>,
  );
  expect(
    screen.getAllByRole("heading", { name: "Approved event" }),
  ).toHaveLength(2);
  expect(
    screen.getAllByRole("link", { name: "Get tickets & details" })[0],
  ).toHaveAttribute("href", "/events/approved-event");
  expect(screen.getByText("On sale")).toBeVisible();
});

it("enables only API-approved live checkout links", () => {
  const approved = event();
  render(<TicketCard ticket={approved.tickets[0]} />);
  expect(
    screen.getByRole("link", { name: "Choose this ticket" }),
  ).toHaveAttribute("href", "/tickets/checkout?event=approved-event");
});

it.each([
  ["scheduled", "Tickets scheduled"],
  ["paused", "Sales paused"],
  ["sold_out", "Sold out"],
  ["sale_ended", "Sales closed"],
] as const)(
  "renders the %s ticket state without checkout",
  (availability, label) => {
    const ticket = {
      ...event().tickets[0],
      availability,
      checkout_href: undefined,
    };
    render(<TicketCard ticket={ticket} />);
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("link", { name: "Choose this ticket" }),
    ).toBeNull();
  },
);

it("fails an on-sale ticket closed when checkout is not mounted", () => {
  const ticket = {
    ...event().tickets[0],
    description: "",
    checkout_href: undefined,
  };
  render(<TicketCard ticket={ticket} />);
  expect(screen.getByText("Checkout coming soon")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

it("labels a completed event as past", () => {
  render(
    <EventCard
      event={event({
        starts_at: "2020-01-01T10:00:00Z",
        ends_at: "2020-01-01T12:00:00Z",
      })}
    />,
  );
  expect(
    screen.getByRole("link", { name: /View event details|Get tickets/ }),
  ).toBeVisible();
  expect(screen.getByText("Past event")).toBeVisible();
});

// A tier's stored availability lags its inventory: the flag still reads
// `on_sale` after the last seat goes. The card used to render "0 remaining"
// beside a live checkout link, walking buyers into an order that cannot be
// filled. Inventory decides, not the flag.
it("treats an on-sale tier with nothing left as sold out", () => {
  const approved = event();
  const exhausted = {
    ...approved.tickets[0],
    availability: "on_sale" as const,
    capacity: 100,
    sold: 95,
    reserved: 5,
  };
  render(<TicketCard ticket={exhausted} />);

  expect(screen.getByText(/0 remaining/)).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Choose this ticket" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByText("Sold out").length).toBeGreaterThan(0);
});

// Stock left but no checkout link configured is a different state, and must
// not be reported to a visitor as sold out.
it("distinguishes a missing checkout link from an exhausted tier", () => {
  const approved = event();
  render(
    <TicketCard ticket={{ ...approved.tickets[0], checkout_href: undefined }} />,
  );
  expect(screen.getByText("Checkout coming soon")).toBeVisible();
  expect(screen.queryByText("Sold out")).not.toBeInTheDocument();
});
