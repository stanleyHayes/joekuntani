"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { ThemeToggle } from "../theme/theme-toggle";
import { ButtonLink } from "../ui/button-link";
import { BrandMark } from "./brand-mark";
import styles from "./mobile-menu.module.css";

type NavItem = { href: string; label: string };

type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
  currentPath?: string;
  navigation: readonly NavItem[];
  brandName: string;
  cta: { href: string; label: string };
};

function linkIsActive(currentPath: string | undefined, href: string) {
  if (!currentPath) return false;
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

/** Kedland-style full-screen mobile menu: focus trap, body scroll lock, Escape. */
export function MobileMenu({
  open,
  onClose,
  currentPath,
  navigation,
  brandName,
  cta,
}: MobileMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      data-testid="mobile-menu"
      className={styles.menu}
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.top}>
        <Link
          className={styles.brand}
          href="/"
          aria-label={`${brandName} home`}
          onClick={onClose}
        >
          <BrandMark brandName={brandName} size="sm" />
        </Link>
        <div className={styles.topActions}>
          <ThemeToggle className={styles.theme} />
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label="Close menu"
            onClick={onClose}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              className={styles.closeIcon}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <nav aria-label="Mobile navigation" className={styles.nav}>
        <p className={styles.eyebrow}>Navigate</p>
        <ul className={styles.list}>
          {navigation.map((item) => {
            const active = linkIsActive(currentPath, item.href);
            return (
              <li key={item.href}>
                <Link
                  className={styles.link}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-active={active ? "true" : "false"}
                  onClick={onClose}
                >
                  {item.label}
                  {active ? (
                    <span className={styles.dot} aria-hidden="true" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <ButtonLink className={styles.cta} href={cta.href} onClick={onClose}>
          {cta.label}
        </ButtonLink>
      </nav>
    </div>
  );
}
