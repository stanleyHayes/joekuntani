import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "./theme-provider";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("toggles the document theme and persists preference", () => {
    document.documentElement.dataset.theme = "dark";
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const button = screen.getByRole("button", {
      name: /Switch to light theme/i,
    });
    const tooltip = screen.getByRole("tooltip", {
      name: "Pull to toggle theme",
    });
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("jk-theme")).toBe("light");
    fireEvent.click(
      screen.getByRole("button", { name: /Switch to dark theme/i }),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("switches theme when the bulb cord is pulled", () => {
    document.documentElement.dataset.theme = "dark";
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const button = screen.getByRole("button", {
      name: /Switch to light theme/i,
    });
    const pull = button.querySelector("svg")?.parentElement?.parentElement;
    expect(pull).toBeInstanceOf(HTMLElement);
    Object.defineProperty(pull, "setPointerCapture", { value: () => {} });

    fireEvent.pointerDown(pull!, { pointerId: 1, clientY: 10 });
    fireEvent.pointerMove(pull!, { pointerId: 1, clientY: 30 });
    fireEvent.pointerUp(pull!, { pointerId: 1, clientY: 30 });

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
