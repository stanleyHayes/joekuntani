"use client";

import styles from "./theme-toggle.module.css";
import { useTheme } from "./theme-provider";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={[styles.toggle, className].filter(Boolean).join(" ")}
      aria-label={`Switch to ${next} theme`}
      aria-pressed={theme === "dark"}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        toggleTheme({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} data-theme={theme}>
          {theme === "dark" ? "◐" : "☀"}
        </span>
      </span>
      <span className={styles.label}>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
