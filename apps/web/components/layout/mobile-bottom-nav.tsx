"use client";

import Link from "next/link";

import styles from "./mobile-bottom-nav.module.css";
import { fallbackNavigation, type NavItem } from "./nav-defaults";
import { NavIcon } from "./nav-icons";

type MobileBottomNavProps = {
  currentPath?: string;
  navigation?: readonly NavItem[];
  cta?: { href: string; label: string };
};

/**
 * Thumb-reach shortcuts, highest-traffic first. Settings still owns which pages
 * exist — this only ranks the ones it publishes, so unpublishing `/shop` drops
 * it from the bar instead of leaving a dead slot.
 */
const PRIORITY = [
  "/events",
  "/videos",
  "/shop",
  "/tickets",
  "/work",
  "/about",
  "/services",
  "/press",
];

/** Four shortcuts plus the enquiry action: five 20%-wide targets on a 360px screen. */
const SHORTCUT_SLOTS = 4;

const HOME: NavItem = { href: "/", label: "Home" };

function linkIsActive(currentPath: string | undefined, href: string) {
  if (!currentPath) return false;
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function shortcutsFor(navigation: readonly NavItem[]): NavItem[] {
  const published = new Map(
    navigation.map((item) => [item.href.replace(/\/+$/, "") || "/", item]),
  );
  // Home is deliberately not sourced from `navigation`: the settings-authored
  // nav often omits it (the wordmark is the desktop route home), but on mobile
  // the wordmark scrolls away with the header.
  const picked: NavItem[] = [published.get("/") ?? HOME];
  for (const href of PRIORITY) {
    if (picked.length >= SHORTCUT_SLOTS) break;
    const item = published.get(href);
    if (item) picked.push(item);
  }
  return picked;
}

export function MobileBottomNav({
  currentPath,
  // Same fallback as the header: an unreachable settings API must not collapse
  // the bar to a lone Home link while the header still shows a full nav.
  navigation = fallbackNavigation,
  cta,
}: MobileBottomNavProps) {
  const shortcuts = shortcutsFor(navigation);
  const enquiry = cta ?? { href: "/book", label: "Make an enquiry" };
  // The enquiry slot is still a route, so it reports its current state like any
  // other tab. Without this it kept its brand wash on every page and never lit
  // the indicator on its own — the one tab you could not locate yourself on.
  const enquiryActive = linkIsActive(currentPath, enquiry.href);

  return (
    <nav
      className={styles.bar}
      aria-label="Quick navigation"
      data-testid="mobile-bottom-nav"
    >
      <ul className={styles.list}>
        {shortcuts.map((item) => {
          const active = linkIsActive(currentPath, item.href);
          return (
            <li key={item.href} className={styles.item}>
              <Link
                className={styles.link}
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : "false"}
              >
                <NavIcon href={item.href} className={styles.icon} />
                <span className={styles.label}>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className={styles.item}>
          {/* "Book" rather than the settings CTA label — a five-up bar cannot
              hold "Make an enquiry", and the header and menu both still carry
              the authored wording. */}
          <Link
            className={styles.action}
            href={enquiry.href}
            aria-current={enquiryActive ? "page" : undefined}
            data-active={enquiryActive ? "true" : "false"}
          >
            <NavIcon href="/book" className={styles.icon} />
            <span className={styles.label}>Book</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
