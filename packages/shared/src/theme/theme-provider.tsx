"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

/**
 * What the server puts on `<html data-theme>` in the root layout. The first
 * client render has to start here or hydration breaks — see ThemeProviderInner.
 */
const SERVER_THEME: Theme = "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme, origin?: { x: number; y: number }) => void;
  toggleTheme: (origin?: { x: number; y: number }) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "jk-theme";

/**
 * `<html data-theme>` is the single source of truth, not React state: the
 * layout's boot script writes it from storage before React hydrates. Treating
 * it as an external store lets `useSyncExternalStore` serve the server's value
 * during hydration and the real one immediately after, which is what keeps the
 * toggle from rendering "Light" over server-rendered "Dark".
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  const current = document.documentElement.dataset.theme;
  return current === "light" || current === "dark" ? current : SERVER_THEME;
}

function getServerSnapshot(): Theme {
  return SERVER_THEME;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  listeners.forEach((listener) => listener());
}

function supportsViewTransition(doc: Document): doc is Document & {
  startViewTransition: (cb: () => void) => { finished: Promise<void> };
} {
  return "startViewTransition" in doc;
}

function ThemeProviderInner({ children }: { children: ReactNode }) {
  // Reading `<html data-theme>` during render used to break hydration: the boot
  // script has already rewritten it, so a light-theme visitor rendered
  // "Light"/"☀" over the server's "Dark"/"◐" and React threw "server rendered
  // text didn't match the client". `useSyncExternalStore` serves the server's
  // value while hydrating and swaps to the live one straight after, so the two
  // renders agree without an effect that sets state.
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback(
    (next: Theme, origin?: { x: number; y: number }) => {
      const root = document.documentElement;
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const run = () => {
        // applyTheme writes the attribute and notifies subscribers, so the
        // render updates from the store rather than a parallel copy of state.
        applyTheme(next);
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
    },
    [],
  );

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

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
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
