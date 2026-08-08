import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme-provider";

function Probe() {
  const { theme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme("light")}>
        set-light
      </button>
      <button type="button" onClick={() => toggleTheme({ x: 12, y: 34 })}>
        toggle-origin
      </button>
    </div>
  );
}

afterEach(() => {
  document.documentElement.dataset.theme = "dark";
  delete document.documentElement.dataset.themeReveal;
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("hydrates from an existing light document theme", () => {
    document.documentElement.dataset.theme = "light";
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("falls back to dark when the document theme is invalid", () => {
    document.documentElement.dataset.theme = "neon";
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("applies theme without view transitions when no origin is provided", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "set-light" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("jk-theme")).toBe("light");
  });

  it("uses circular view-transition reveal when supported and origin is set", async () => {
    const finished = Promise.resolve();
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return { finished };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "toggle-origin" }));
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(document.documentElement.style.getPropertyValue("--theme-reveal-x")).toBe(
      "12px",
    );
    expect(document.documentElement.style.getPropertyValue("--theme-reveal-y")).toBe(
      "34px",
    );
    await finished;
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "toggle-origin" }));
    expect(startViewTransition).toHaveBeenCalledTimes(2);
    await finished;
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("nests without creating a second theme context", () => {
    render(
      <ThemeProvider>
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("skips persistence when storage throws", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "set-light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("rejects useTheme outside provider", () => {
    function Bare() {
      useTheme();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/ThemeProvider/);
  });

  it("treats missing matchMedia as no reduced-motion preference", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "toggle-origin" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
