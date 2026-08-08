"use client";

import { ArrowClockwise, WarningOctagon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import styles from "./admin-feedback.module.css";

type SkeletonVariant = "cards" | "form" | "page" | "table";

export function formatAdminTimestamp(value: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export function AdminSkeleton({
  label = "Loading workspace",
  variant = "page",
}: {
  label?: string;
  variant?: SkeletonVariant;
}) {
  return (
    <div
      className={styles.skeleton}
      data-variant={variant}
      role="status"
      aria-label={label}
    >
      <span className={styles.visuallyHidden}>{label}</span>
      <div className={styles.skeletonHeader}>
        <i />
        <span>
          <i />
          <i />
        </span>
      </div>
      <div className={styles.skeletonToolbar}>
        <i />
        <i />
        <i />
      </div>
      <div className={styles.skeletonBody}>
        {Array.from({ length: variant === "table" ? 6 : 4 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
    </div>
  );
}

export function ButtonPending({ label }: { label: string }) {
  return (
    <span className={styles.pending} role="status" aria-label={label}>
      <span className={styles.visuallyHidden}>{label}</span>
      <span className={styles.pendingDots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

export function AdminErrorState({
  action,
  message,
  retry = true,
  title = "This workspace could not be loaded",
}: {
  action?: ReactNode;
  message: string;
  retry?: boolean;
  title?: string;
}) {
  const resolvedAction =
    action ??
    (retry ? (
      <button
        className={styles.retryButton}
        type="button"
        onClick={() => window.location.reload()}
      >
        <ArrowClockwise size={15} aria-hidden="true" />
        Try again
      </button>
    ) : null);

  return (
    <section className={styles.errorState} role="alert">
      <span className={styles.errorIcon} aria-hidden="true">
        <WarningOctagon size={24} weight="duotone" />
      </span>
      <div className={styles.errorCopy}>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      {resolvedAction ? (
        <div className={styles.errorAction}>{resolvedAction}</div>
      ) : null}
    </section>
  );
}
