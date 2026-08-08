import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationFields } from "./location-fields";

describe("LocationFields", () => {
  it("derives checkout country, region and city values from dependent search fields", () => {
    const { container } = render(<LocationFields />);

    const country = screen.getByRole("combobox", { name: "Country" });
    fireEvent.change(country, { target: { value: "United States" } });

    const region = screen.getByRole("combobox", {
      name: "Region / state",
    });
    expect(region).toBeEnabled();
    fireEvent.change(region, { target: { value: "California" } });

    const city = screen.getByRole("combobox", { name: "City" });
    expect(city).toBeEnabled();
    fireEvent.change(city, { target: { value: "Los Angeles" } });

    expect(
      container.querySelector<HTMLInputElement>('input[name="country_code"]')
        ?.value,
    ).toBe("US");
    expect(
      container.querySelector<HTMLInputElement>('input[name="region"]')?.value,
    ).toBe("California");
    expect(
      container.querySelector<HTMLInputElement>('input[name="city"]')?.value,
    ).toBe("Los Angeles");
  });

  it("resets dependent location values when the country changes", () => {
    const { container } = render(<LocationFields />);
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), {
      target: { value: "United States" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Region / state" }), {
      target: { value: "California" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), {
      target: { value: "Los Angeles" },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), {
      target: { value: "Ghana" },
    });

    expect(
      container.querySelector<HTMLInputElement>('input[name="country_code"]')
        ?.value,
    ).toBe("GH");
    expect(
      container.querySelector<HTMLInputElement>('input[name="region"]')?.value,
    ).toBe("");
    expect(
      container.querySelector<HTMLInputElement>('input[name="city"]')?.value,
    ).toBe("");
  });
});
