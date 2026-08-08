import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MobileBottomNav } from "./mobile-bottom-nav";

function slots() {
  const bar = screen.getByRole("navigation", { name: "Quick navigation" });
  return within(bar)
    .getAllByRole("link")
    .map((link) => link.textContent?.trim());
}

describe("MobileBottomNav", () => {
  it("ranks published pages by traffic and always ends on the enquiry action", () => {
    render(
      <MobileBottomNav
        currentPath="/events"
        navigation={[
          { href: "/about", label: "About" },
          { href: "/work", label: "Work" },
          { href: "/videos", label: "Videos" },
          { href: "/events", label: "Events" },
          { href: "/shop", label: "Shop" },
        ]}
        cta={{ href: "/book", label: "Make an enquiry" }}
      />,
    );

    // Home is prepended even though settings never published it, and the bar
    // stops at four shortcuts so the fifth slot stays the enquiry action.
    expect(slots()).toEqual(["Home", "Events", "Videos", "Shop", "Book"]);
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute(
      "href",
      "/book",
    );
  });

  it("drops shortcuts that settings has unpublished", () => {
    render(
      <MobileBottomNav
        currentPath="/"
        navigation={[{ href: "/about", label: "About" }]}
        cta={{ href: "/book", label: "Make an enquiry" }}
      />,
    );
    expect(slots()).toEqual(["Home", "About", "Book"]);
  });

  it("falls back to the shared default navigation when settings are missing", () => {
    render(<MobileBottomNav currentPath="/videos" />);
    expect(slots()).toEqual(["Home", "Events", "Videos", "Work", "Book"]);
    expect(screen.getByRole("link", { name: "Videos" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks only the root route as home", () => {
    render(<MobileBottomNav currentPath="/events/accra" />);
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
