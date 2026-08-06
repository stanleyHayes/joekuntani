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
    screen.getByRole("link", { name: "View event and tickets" }),
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
