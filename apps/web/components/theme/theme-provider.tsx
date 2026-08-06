"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme, origin?: { x: number; y: number }) => void;
  toggleTheme: (origin?: { x: number; y: number }) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "jk-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function supportsViewTransition(
  doc: Document,
): doc is Document & { startViewTransition: (cb: () => void) => { finished: Promise<void> } } {
  return "startViewTransition" in doc;
}

function readInitialTheme(): Theme {
  /* v8 ignore next 3 -- SSR/prerender safety; jsdom always has document */
  if (typeof document === "undefined") {
    return "dark";
  }
  const current = document.documentElement.dataset.theme;
  return current === "light" || current === "dark" ? current : "dark";
}

function ThemeProviderInner({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  const setTheme = useCallback((next: Theme, origin?: { x: number; y: number }) => {
    const root = document.documentElement;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      applyTheme(next);
      setThemeState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* private mode */
      }
    };

    if (reduceMotion || !supportsViewTransition(document) || !origin) {
      run();
      return;
    }

    root.style.setProperty("--theme-reveal-x", `${origin.x}px`);
    root.style.setProperty("--theme-reveal-y", `${origin.y}px`);
    root.dataset.themeReveal = next === "dark" ? "to-dark" : "to-light";

    const transition = document.startViewTransition(() => {
      run();
    });
    void transition.finished.finally(() => {
      delete root.dataset.themeReveal;
    });
  }, []);

  const toggleTheme = useCallback(
    (origin?: { x: number; y: number }) => {
      setTheme(theme === "dark" ? "light" : "dark", origin);
    },
    [setTheme, theme],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Nestable: if a provider already exists (root layout), shells pass through. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const existing = useContext(ThemeContext);
  if (existing) {
    return children;
  }
  return <ThemeProviderInner>{children}</ThemeProviderInner>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
