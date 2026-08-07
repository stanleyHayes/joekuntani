"use client";

import type { ReactNode } from "react";
import styles from "./empty-state.module.css";

export type EmptyStateTone =
  | "stage"
  | "inbox"
  | "media"
  | "calendar"
  | "search";

type EmptyStateProps = {
  title: string;
  description: string;
  tone?: EmptyStateTone;
  action?: ReactNode;
  className?: string;
  announce?: boolean;
};

function StageIcon() {
  return (
    <svg className={styles.glyph} viewBox="0 0 64 64" aria-hidden="true">
      <circle className={styles.ring} cx="32" cy="32" r="22" />
      <path
        className={styles.mic}
        d="M32 14c-4.4 0-8 3.1-8 7v10c0 3.9 3.6 7 8 7s8-3.1 8-7V21c0-3.9-3.6-7-8-7z"
      />
      <path
        className={styles.stand}
        d="M22 36c2.4 4.2 6 6.5 10 6.5s7.6-2.3 10-6.5M32 42.5V50M24 50h16"
      />
      <circle className={styles.spark} cx="48" cy="16" r="2.2" />
      <circle className={styles.sparkDelay} cx="16" cy="20" r="1.6" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg className={styles.glyph} viewBox="0 0 64 64" aria-hidden="true">
      <rect
        className={styles.tray}
        x="12"
        y="18"
        width="40"
        height="30"
        rx="6"
      />
      <path className={styles.flap} d="M12 26l20 12 20-12" />
      <circle className={styles.spark} cx="46" cy="16" r="2" />
    </svg>
  );
}

function MediaIcon() {
  return (
    <svg className={styles.glyph} viewBox="0 0 64 64" aria-hidden="true">
      <rect
        className={styles.frame}
        x="14"
        y="16"
        width="36"
        height="32"
        rx="6"
      />
      <circle className={styles.lens} cx="32" cy="32" r="8" />
      <circle className={styles.spark} cx="44" cy="22" r="2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className={styles.glyph} viewBox="0 0 64 64" aria-hidden="true">
      <rect
        className={styles.frame}
        x="14"
        y="18"
        width="36"
        height="32"
        rx="6"
      />
      <path className={styles.stand} d="M14 28h36M24 14v8M40 14v8" />
      <circle className={styles.spark} cx="26" cy="38" r="2" />
      <circle className={styles.sparkDelay} cx="36" cy="38" r="2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className={styles.glyph} viewBox="0 0 64 64" aria-hidden="true">
      <circle className={styles.ring} cx="28" cy="28" r="12" />
      <path className={styles.stand} d="M37 37l12 12" />
      <circle className={styles.spark} cx="48" cy="18" r="2" />
    </svg>
  );
}

const icons: Record<EmptyStateTone, () => ReactNode> = {
  stage: StageIcon,
  inbox: InboxIcon,
  media: MediaIcon,
  calendar: CalendarIcon,
  search: SearchIcon,
};

export function EmptyState({
  title,
  description,
  tone = "stage",
  action,
  className,
  announce = true,
}: EmptyStateProps) {
  const Icon = icons[tone] ?? StageIcon;
  return (
    <div
      className={[styles.root, className].filter(Boolean).join(" ")}
      role={announce ? "status" : undefined}
      data-tone={tone}
    >
      <div className={styles.iconWrap} aria-hidden="true">
        <span className={styles.halo} />
        <Icon />
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
