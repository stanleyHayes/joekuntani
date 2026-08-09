import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { EventCalendar, buildCalendarMonths } from "./event-calendar";
import type { PublicEvent } from "./types";

// Local noon, so the test never straddles a timezone boundary.
const NOW = new Date(2026, 8, 15, 12, 0, 0);

const event = (
  slug: string,
  startsAt: Date,
  partial: Partial<PublicEvent> = {},
): PublicEvent =>
  ({
    id: slug,
    slug,
    title: `Show ${slug}`,
    summary: "",
    description: "",
    venue: { name: "Kempinski", address: "", city: "Accra", country_code: "GH" },
    policies: {},
    starts_at: startsAt.toISOString(),
    ends_at: startsAt.toISOString(),
    timezone: "Africa/Accra",
    banner_asset_id: "",
    banner: { featured: false },
    tickets: [],
    availability: "on_sale",
    ...partial,
  }) as PublicEvent;

// A performer's year is sparse. Twelve mostly-blank grids buries the dates.
it("renders only the months that actually contain dates", () => {
  const months = buildCalendarMonths(
    [
      event("a", new Date(2026, 8, 20, 19)),
      event("b", new Date(2026, 10, 2, 19)),
    ],
    NOW,
  );
  expect(months.map((month) => month.key)).toEqual(["2026-09", "2026-11"]);
});

it("renders nothing at all when there are no dates", () => {
  expect(buildCalendarMonths([], NOW)).toEqual([]);
  const { container } = render(<EventCalendar events={[]} now={NOW} />);
  expect(container).toBeEmptyDOMElement();
});

// Weeks start Monday here, so the grid must pad to the correct column.
// 1 September 2026 is a Tuesday, which is column index 1.
it("aligns the first day to a Monday-first week", () => {
  const [month] = buildCalendarMonths([event("a", new Date(2026, 8, 20, 19))], NOW);
  const firstWeek = month.weeks[0];
  expect(firstWeek[0].day).toBeNull();
  expect(firstWeek[1].day).toBe(1);
  expect(month.weeks.every((week) => week.length === 7)).toBe(true);
});

it("puts an event on its own local day and marks today", () => {
  const [month] = buildCalendarMonths([event("a", new Date(2026, 8, 20, 19))], NOW);
  const days = month.weeks.flat();
  expect(days.find((day) => day.day === 20)?.events).toHaveLength(1);
  expect(days.find((day) => day.isToday)?.day).toBe(15);
  expect(days.find((day) => day.day === 14)?.isPast).toBe(true);
  expect(days.find((day) => day.day === 20)?.isPast).toBe(false);
});

// Two shows in a night is a real case, and the second must not overwrite the
// first.
it("keeps every event that shares a day", () => {
  const [month] = buildCalendarMonths(
    [
      event("early", new Date(2026, 8, 20, 18)),
      event("late", new Date(2026, 8, 20, 21)),
    ],
    NOW,
  );
  const day = month.weeks.flat().find((cell) => cell.day === 20);
  expect(day?.events.map((item) => item.slug)).toEqual(["early", "late"]);
});

it("ignores an event with an unparseable date rather than dropping the grid", () => {
  const broken = event("bad", new Date(2026, 8, 20, 19));
  broken.starts_at = "not-a-date";
  const months = buildCalendarMonths(
    [broken, event("good", new Date(2026, 8, 21, 19))],
    NOW,
  );
  expect(months).toHaveLength(1);
  expect(months[0].count).toBe(1);
});

it("links each date to its event and counts the month", () => {
  render(
    <EventCalendar
      events={[event("accra-night", new Date(2026, 8, 20, 19))]}
      now={NOW}
    />,
  );
  const link = screen.getByRole("link", { name: "Show accra-night" });
  expect(link).toHaveAttribute("href", "/events/accra-night");
  expect(screen.getByText("1 date")).toBeInTheDocument();
});

// The grid is tabular data; column headers are abbreviated to one letter on
// screen, so the full weekday has to remain available to a screen reader.
it("exposes the grid as a table with full weekday headers", () => {
  render(
    <EventCalendar events={[event("a", new Date(2026, 8, 20, 19))]} now={NOW} />,
  );
  const table = screen.getByRole("table");
  expect(within(table).getByRole("columnheader", { name: "Monday" })).toBeInTheDocument();
  expect(within(table).getByRole("columnheader", { name: "Sunday" })).toBeInTheDocument();
});

it("marks a sold-out date so the grid does not promise tickets", () => {
  render(
    <EventCalendar
      events={[event("gone", new Date(2026, 8, 20, 19), { availability: "sold_out" })]}
      now={NOW}
    />,
  );
  expect(screen.getByRole("link", { name: "Show gone" })).toHaveAttribute(
    "data-sold-out",
    "true",
  );
});
