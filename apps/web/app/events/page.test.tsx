import { render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import EventsPage from "./page";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_CONTENT;
});

it("renders demo event inventory with filters and ticket links", async () => {
  process.env.NEXT_PUBLIC_DEMO_CONTENT = "1";
  render(
    await EventsPage({
      searchParams: Promise.resolve({
        city: "Accra",
        period: "all",
        availability: "all",
      }),
    }),
  );

  expect(screen.getByText("Demo programme")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Find an event" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: /Delivery Night — Accra/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: /tickets & details/i }),
  ).toHaveAttribute("href", expect.stringContaining("/events/"));
});

it("keeps a clear empty state when no demo event matches", async () => {
  process.env.NEXT_PUBLIC_DEMO_CONTENT = "true";
  render(
    await EventsPage({
      searchParams: Promise.resolve({
        city: "Takoradi",
        date: "not-a-date",
        period: "past",
        availability: "sold_out",
      }),
    }),
  );

  expect(
    screen.getByRole("heading", { name: "No matching events" }),
  ).toBeVisible();
});
