import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import { EventFilters } from "./event-filters";

it("shows defaults and updates every event filter", () => {
  const { container } = render(
    <EventFilters cities={["Accra", "Kumasi"]} filters={{}} safeDate="" />,
  );
  expect(screen.getByText("Show upcoming by default")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "City" }));
  fireEvent.click(screen.getByRole("option", { name: "Accra" }));
  fireEvent.click(screen.getByRole("button", { name: "When" }));
  fireEvent.click(screen.getByRole("option", { name: "Past" }));
  fireEvent.click(screen.getByRole("button", { name: "Ticket availability" }));
  fireEvent.click(screen.getByRole("option", { name: "Sold out" }));

  fireEvent.click(screen.getByRole("button", { name: "Date" }));
  const dialog = screen.getByRole("dialog", { name: "Date" });
  fireEvent.click(
    within(dialog)
      .getAllByRole("button", { name: "6" })
      .find((button) => button.dataset.inMonth === "true")!,
  );

  expect(screen.getByText("4 active")).toBeVisible();
  expect(
    container.querySelector<HTMLInputElement>('input[name="city"]'),
  ).toHaveValue("Accra");
  expect(
    container.querySelector<HTMLInputElement>('input[name="period"]'),
  ).toHaveValue("past");
  expect(
    container.querySelector<HTMLInputElement>('input[name="availability"]'),
  ).toHaveValue("sold_out");
  expect(
    container.querySelector<HTMLInputElement>('input[name="date"]'),
  ).toHaveValue("2026-08-06");
  expect(screen.getByRole("link", { name: "Reset" })).toHaveAttribute(
    "href",
    "/events",
  );
});

it("hydrates valid incoming filters and counts only non-default values", () => {
  render(
    <EventFilters
      cities={[]}
      filters={{ city: "Tema", period: "all", availability: "on_sale" }}
      safeDate="2026-08-20"
    />,
  );
  expect(screen.getByText("4 active")).toBeVisible();
});
