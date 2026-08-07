import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../theme/theme-provider";
import { MobileMenu } from "./mobile-menu";

const navigation = [
  { href: "/", label: "Home" },
  { href: "/work", label: "Work" },
] as const;

afterEach(() => {
  document.body.style.overflow = "";
});

describe("MobileMenu", () => {
  it("stays unmounted while closed", () => {
    render(
      <ThemeProvider>
        <MobileMenu
          open={false}
          onClose={vi.fn()}
          currentPath="/"
          navigation={navigation}
          brandName="Joe Kuntani"
          cta={{ href: "/book", label: "Book Joe" }}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });

  it("marks nested routes active, traps focus, closes and restores scrolling", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ThemeProvider>
        <MobileMenu
          open
          onClose={onClose}
          currentPath="/work/case-study"
          navigation={navigation}
          brandName="Joe Kuntani"
          cta={{ href: "/book", label: "Book Joe" }}
        />
      </ThemeProvider>,
    );

    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const close = screen.getByRole("button", { name: "Close menu" });
    const cta = screen.getByRole("link", { name: "Book Joe" });
    expect(close).toHaveFocus();

    cta.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(
      screen.getByRole("link", { name: "Joe Kuntani home" }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(cta).toHaveFocus();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(close);
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    fireEvent.click(cta);
    expect(onClose).toHaveBeenCalledTimes(4);

    rerender(
      <ThemeProvider>
        <MobileMenu
          open={false}
          onClose={onClose}
          navigation={navigation}
          brandName="Joe Kuntani"
          cta={{ href: "/book", label: "Book Joe" }}
        />
      </ThemeProvider>,
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("marks only the root route as home", () => {
    render(
      <ThemeProvider>
        <MobileMenu
          open
          onClose={vi.fn()}
          currentPath="/"
          navigation={navigation}
          brandName="Joe Kuntani"
          cta={{ href: "/book", label: "Book Joe" }}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Work" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
