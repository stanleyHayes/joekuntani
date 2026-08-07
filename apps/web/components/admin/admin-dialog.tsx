"use client";

import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import styles from "./admin-dialog.module.css";

const subscribeToMount = () => () => {};

export function AdminDialog({
  children,
  description,
  onClose,
  title,
  wide = false,
}: {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  const titleID = useId();
  const descriptionID = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);
  const mounted = useSyncExternalStore(
    subscribeToMount,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.dataset.adminDialogOpen = "true";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      delete document.body.dataset.adminDialogOpen;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [mounted]);

  const dialog = (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        data-wide={wide ? "true" : "false"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleID}
        aria-describedby={description ? descriptionID : undefined}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div>
            <h2 id={titleID}>{title}</h2>
            {description ? <p id={descriptionID}>{description}</p> : null}
          </div>
          <button type="button" aria-label="Close dialog" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );

  return mounted ? createPortal(dialog, document.body) : null;
}
