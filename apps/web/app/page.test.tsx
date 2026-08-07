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
      screen.getByRole("link", { name: "Explore the work" }),
    ).toHaveAttribute("href", "/work");
  });

  it("renders the expanded demo homepage from clearly labelled fixtures", async () => {
    process.env.NEXT_PUBLIC_DEMO_CONTENT = "1";
    try {
      render(await FoundationPage());

      expect(screen.getByText("Demo preview")).toBeVisible();
      expect(
        screen.getByAltText(
          "Demo stage atmosphere placeholder. Replace via CMS.",
        ),
      ).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "Selected work" }),
      ).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "Ways to work together" }),
      ).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "What collaborators say" }),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: /Delivery musician sets/ }),
      ).toHaveAttribute("href", "/work/delivery-musician-sets");
    } finally {
      delete process.env.NEXT_PUBLIC_DEMO_CONTENT;
    }
  });
});
