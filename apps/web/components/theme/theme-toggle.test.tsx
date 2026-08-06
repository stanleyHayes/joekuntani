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
    const button = screen.getByRole("button", { name: /Switch to light theme/i });
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("jk-theme")).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: /Switch to dark theme/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
