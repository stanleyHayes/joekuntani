"use client";

import { MicrophoneStage } from "@phosphor-icons/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ThemeToggle } from "../theme/theme-toggle";
import { SupportButton } from "../support/support-button";
import { BrandMark } from "./brand-mark";
import { MobileMenu } from "./mobile-menu";
import {
  fallbackNavigation,
  withShopNavigation,
  withNavMetadata,
  type NavItem,
} from "./nav-defaults";
import { NavIcon, NavWatermark } from "./nav-icon";
import styles from "./public-header.module.css";

/**
 * Folds flat navigation into groups so the bar stays short as sections are
 * added. Settings still owns the links themselves; this only decides which of
 * them sit behind a shared trigger.
 */
const NAV_GROUPS: readonly {
  label: string;
  href: string;
  hrefs: readonly string[];
}[] = [
  {
    label: "Media",
    href: "/media",
    hrefs: ["/media/videos", "/media/press", "/videos", "/press"],
  },
];

const MEDIA_CANONICAL: Record<string, string> = {
  "/videos": "/media/videos",
  "/press": "/media/press",
};

/** Stable DOM id fragment from an href, for aria-labelledby/-describedby. */
function slugForID(href: string) {
  return href.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
}

function groupNavigation(navigation: readonly NavItem[]): NavItem[] {
  const grouped: NavItem[] = [];
  const claimed = new Set<string>();

  for (const group of NAV_GROUPS) {
    // Links from settings carry only href and label, so the dropdown fills in
    // the description and icon it needs to show more than a bare title.
    const children = navigation
      .filter((item) => group.hrefs.includes(item.href))
      .map((item) =>
        withNavMetadata({
          ...item,
          href: MEDIA_CANONICAL[item.href] ?? item.href,
        }),
      );
    // A group with one surviving child is just that link — don't hide a single
    // page behind a menu.
    if (children.length < 2) continue;
    navigation
      .filter((item) => group.hrefs.includes(item.href))
      .forEach((child) => claimed.add(child.href));
    grouped.push({ href: group.href, label: group.label, children });
  }

  const result: NavItem[] = [];
  let inserted = false;
  for (const item of navigation) {
    if (!claimed.has(item.href)) {
      result.push(item);
      continue;
    }
    if (!inserted) {
      result.push(...grouped);
      inserted = true;
    }
  }
  return inserted ? result : [...navigation, ...grouped];
}

type PublicHeaderProps = {
  currentPath?: string;
  navigation?: readonly NavItem[];
  brandName?: string;
  cta?: { href: string; label: string };
};

function linkIsActive(currentPath: string | undefined, href: string) {
  if (!currentPath) return false;
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function NavGroup({
  item,
  currentPath,
  tone,
  registerRef,
  onHover,
}: {
  item: NavItem;
  currentPath?: string;
  tone: (href: string) => string;
  registerRef: (node: HTMLElement | null) => void;
  onHover: (href: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const groupRef = useRef<HTMLLIElement>(null);
  const micRef = useRef<HTMLSpanElement>(null);
  const dragStart = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const children = item.children ?? [];
  const childActive = children.some((child) =>
    linkIsActive(currentPath, child.href),
  );

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!groupRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function resetMic() {
    micRef.current?.style.setProperty("--mic-pull", "0px");
    dragStart.current = null;
  }

  return (
    <li
      ref={groupRef}
      className={styles.navGroup}
      // Pointer users get hover; keyboard and touch users get the click target.
      onMouseEnter={() => {
        setOpen(true);
        onHover(item.href);
      }}
      onMouseLeave={() => {
        setOpen(false);
        onHover(null);
      }}
    >
      <button
        ref={registerRef}
        type="button"
        className={`${styles.navLink} ${styles.navTrigger} ${tone(item.href)}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-current={childActive ? "true" : undefined}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          setOpen((value) => !value);
        }}
      >
        <span className={styles.navTriggerLabel}>{item.label}</span>
        <span
          ref={micRef}
          aria-hidden="true"
          className={styles.micPull}
          onPointerDown={(event) => {
            dragStart.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            const pull = Math.max(
              0,
              Math.min(28, event.clientY - dragStart.current),
            );
            event.currentTarget.style.setProperty("--mic-pull", `${pull}px`);
            if (pull > 5) suppressClick.current = true;
          }}
          onPointerUp={(event) => {
            if (dragStart.current === null) return;
            const pull = Math.max(0, event.clientY - dragStart.current);
            if (pull >= 14) setOpen(true);
            resetMic();
          }}
          onPointerCancel={resetMic}
        >
          <span className={styles.micMount} />
          <span className={styles.micWeight}>
            <span className={styles.micCable} />
            <MicrophoneStage weight="fill" className={styles.micIcon} />
          </span>
        </span>
      </button>
      <ul className={styles.navMenu} data-open={open} aria-label={item.label}>
        <NavWatermark name={children[0]?.icon} />
        {children.map((child) => {
          // The description is a description, not part of the name: without
          // this the link announces as "Videos Reels, live clips and interview
          // cuts" and every menu item reads as a paragraph.
          const titleID = `nav-${slugForID(child.href)}-title`;
          const descriptionID = `nav-${slugForID(child.href)}-description`;
          return (
            <li key={child.href}>
              <Link
                href={child.href}
                className={styles.navMenuLink}
                aria-labelledby={titleID}
                aria-describedby={child.description ? descriptionID : undefined}
                aria-current={
                  linkIsActive(currentPath, child.href) ? "page" : undefined
                }
                onClick={() => setOpen(false)}
              >
                <NavIcon name={child.icon} />
                <span className={styles.navMenuCopy}>
                  <span className={styles.navMenuTitle} id={titleID}>
                    {child.label}
                  </span>
                  {child.description ? (
                    <span
                      className={styles.navMenuDescription}
                      id={descriptionID}
                    >
                      {child.description}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function NavCapsule({
  currentPath,
  navigation,
}: {
  currentPath?: string;
  navigation: readonly NavItem[];
}) {
  const capsuleRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [hovered, setHovered] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const activeHref =
    navigation.find((item) => linkIsActive(currentPath, item.href))?.href ??
    null;
  const pillTarget = hovered ?? activeHref;
  const pillOnActive = pillTarget !== null && pillTarget === activeHref;

  const moveTo = useCallback((href: string | null) => {
    const capsule = capsuleRef.current;
    const item = href ? itemRefs.current.get(href) : undefined;
    if (!capsule || !item) {
      setIndicator(null);
      return;
    }
    const capsuleRect = capsule.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    setIndicator({
      left: itemRect.left - capsuleRect.left - capsule.clientLeft,
      width: itemRect.width,
    });
  }, []);

  useLayoutEffect(() => {
    moveTo(pillTarget);
  }, [pillTarget, moveTo, navigation]);

  useEffect(() => {
    const capsule = capsuleRef.current;
    if (!capsule || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => moveTo(pillTarget));
    observer.observe(capsule);
    return () => observer.disconnect();
  }, [moveTo, pillTarget]);

  function tone(href: string) {
    if (href === pillTarget && pillOnActive) return styles.linkActive;
    if (href === pillTarget) return styles.linkHovered;
    if (href === activeHref) return styles.linkCurrent;
    return styles.linkIdle;
  }

  return (
    <ul ref={capsuleRef} className={styles.navList} data-testid="nav-capsule">
      {indicator ? (
        <span
          aria-hidden="true"
          className={[
            styles.indicator,
            pillOnActive ? styles.indicatorActive : styles.indicatorHover,
          ].join(" ")}
          style={{
            transform: `translateX(${indicator.left}px)`,
            width: `${indicator.width}px`,
          }}
        />
      ) : null}
      {navigation.map((item) =>
        item.children?.length ? (
          <NavGroup
            key={item.label}
            item={item}
            currentPath={currentPath}
            tone={tone}
            registerRef={(node) => {
              if (node) itemRefs.current.set(item.href, node);
              else itemRefs.current.delete(item.href);
            }}
            onHover={setHovered}
          />
        ) : (
          <li key={item.href}>
            <Link
              ref={(node) => {
                if (node) itemRefs.current.set(item.href, node);
                else itemRefs.current.delete(item.href);
              }}
              className={`${styles.navLink} ${item.label === "Book" ? styles.bookLink : ""} ${tone(item.href)}`}
              aria-current={
                linkIsActive(currentPath, item.href) ? "page" : undefined
              }
              href={item.href}
              onMouseEnter={() => setHovered(item.href)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(item.href)}
              onBlur={() => setHovered(null)}
            >
              {item.label}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={styles.menuIcon}
    >
      {open ? (
        <>
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle cx="6" cy="6" r="1.6" fill="currentColor" />
          <circle cx="12" cy="6" r="1.6" fill="currentColor" />
          <circle cx="18" cy="6" r="1.6" fill="currentColor" />
          <circle cx="6" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="18" cy="12" r="1.6" fill="currentColor" />
          <circle cx="6" cy="18" r="1.6" fill="currentColor" />
          <circle cx="12" cy="18" r="1.6" fill="currentColor" />
          <circle cx="18" cy="18" r="1.6" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function PublicHeader({
  currentPath,
  navigation = fallbackNavigation,
  brandName,
  cta,
}: PublicHeaderProps) {
  const safeBrandName = brandName || "Joe Kuntani";
  const safeCTA = cta || { href: "/book", label: "Make an enquiry" };
  const navigationWithShop = withShopNavigation(navigation);
  const navigationWithBooking = navigationWithShop.some(
    (item) => item.href === safeCTA.href,
  )
    ? navigationWithShop.map((item) =>
        item.href === safeCTA.href ? { ...item, label: "Book" } : item,
      )
    : [
        ...navigationWithShop.slice(
          0,
          Math.ceil(navigationWithShop.length / 2),
        ),
        { href: safeCTA.href, label: "Book" },
        ...navigationWithShop.slice(Math.ceil(navigationWithShop.length / 2)),
      ];
  const grouped = groupNavigation(navigationWithBooking);
  const bookingItem = grouped.find((item) => item.label === "Book");
  const groupedWithoutBooking = grouped.filter((item) => item.label !== "Book");
  const bookingIndex = Math.floor(groupedWithoutBooking.length / 2);
  const groupedNavigation = bookingItem
    ? [
        ...groupedWithoutBooking.slice(0, bookingIndex),
        bookingItem,
        ...groupedWithoutBooking.slice(bookingIndex),
      ]
    : grouped;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollFrame = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      scrollFrame.current = null;
      setScrolled(window.scrollY > 48);
    };
    const onScroll = () => {
      if (scrollFrame.current !== null) return;
      scrollFrame.current = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      if (scrollFrame.current !== null)
        cancelAnimationFrame(scrollFrame.current);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <>
      <header
        className={styles.header}
        data-header-state={scrolled ? "floating" : "settled"}
      >
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className={styles.bar} data-testid="header-bar">
          <Link
            className={styles.brand}
            href="/"
            aria-label={`${safeBrandName} home`}
          >
            <BrandMark brandName={safeBrandName} priority size="sm" />
          </Link>

          <nav className={styles.desktopNav} aria-label="Primary navigation">
            <NavCapsule
              currentPath={currentPath}
              navigation={groupedNavigation}
            />
          </nav>

          <div className={styles.actions}>
            <SupportButton className={styles.support} label="Support" />
            <ThemeToggle className={styles.theme} />
            <button
              type="button"
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MenuIcon open={menuOpen} />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        currentPath={currentPath}
        navigation={navigationWithBooking}
        brandName={safeBrandName}
        cta={safeCTA}
      />
    </>
  );
}
