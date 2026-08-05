import { render, screen } from "@testing-library/react";

import FoundationPage from "./page";

describe("FoundationPage", () => {
  it("identifies visual and written content as non-production placeholders", async () => {
    render(await FoundationPage());

    expect(
      screen.getByRole("heading", { name: "Joe Kuntani", level: 1 }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: /hero media\. placeholder - content awaiting approval/i,
      }),
    ).toBeVisible();
    expect(screen.getAllByText(/awaiting approval/i).length).toBeGreaterThan(1);
    expect(
      screen.getByRole("link", { name: "Review planned sections" }),
    ).toHaveAttribute("href", "#planned-content");
  });
});
