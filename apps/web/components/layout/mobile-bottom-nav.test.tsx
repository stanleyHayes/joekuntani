import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileBottomNav } from "./mobile-bottom-nav";

function slots() {
  const bar = screen.getByRole("navigation", { name: "Quick navigation" });
  return within(bar)
    .getAllByRole("link")
    .map((link) => link.textContent?.trim());
}

describe("MobileBottomNav", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ranks published pages by traffic and keeps Book in the middle", () => {
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

    expect(slots()).toEqual(["Home", "Events", "Book", "Videos", "Shop"]);
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
    expect(slots()).toEqual(["Home", "Shop", "Book", "About"]);
  });

  it("falls back to the shared default navigation when settings are missing", () => {
    render(<MobileBottomNav currentPath="/shop" />);
    expect(slots()).toEqual(["Home", "Events", "Book", "Videos", "Shop"]);
    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks the canonical videos page active when settings still use /videos", () => {
    render(
      <MobileBottomNav
        currentPath="/media/videos"
        navigation={[
          { href: "/events", label: "Events" },
          { href: "/videos", label: "Videos" },
          { href: "/shop", label: "Shop" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Videos" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("settles the floating bar against the footer when it enters view", () => {
    let notify: IntersectionObserverCallback = () => undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(
      <>
        <footer className="site-footer" />
        <MobileBottomNav currentPath="/" />
      </>,
    );
    const bar = screen.getByTestId("mobile-bottom-nav");
    expect(bar).toHaveAttribute("data-docked", "false");
    act(() =>
      notify(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(bar).toHaveAttribute("data-docked", "true");
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
