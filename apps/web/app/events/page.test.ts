import { expect, it } from "vitest";
import { event } from "../../components/events/test-fixture";
import { filterEvents } from "./page";

it("filters events by city, local date, period and availability", () => {
  const upcoming = event();
  const past = event({
    id: crypto.randomUUID(),
    slug: "past",
    starts_at: "2026-07-01T18:00:00Z",
    ends_at: "2026-07-01T21:00:00Z",
    availability: "sale_ended",
  });
  const now = new Date("2026-08-05T00:00:00Z");
  expect(
    filterEvents(
      [past, upcoming],
      {
        city: "Accra",
        date: "2026-08-10",
        period: "upcoming",
        availability: "on_sale",
      },
      now,
    ),
  ).toEqual([upcoming]);
  expect(filterEvents([past, upcoming], { period: "past" }, now)).toEqual([
    past,
  ]);
  expect(filterEvents([past, upcoming], { period: "all" }, now)).toHaveLength(
    2,
  );
  expect(filterEvents([upcoming], { city: "Kumasi" }, now)).toEqual([]);
  expect(filterEvents([upcoming], { date: "not-a-date" }, now)).toEqual([
    upcoming,
  ]);
  expect(filterEvents([upcoming], { availability: "sold_out" }, now)).toEqual(
    [],
  );
  expect(filterEvents([upcoming], { availability: "all" }, now)).toEqual([
    upcoming,
  ]);
});
