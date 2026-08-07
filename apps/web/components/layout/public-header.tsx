"use client";

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
import { ButtonLink } from "../ui/button-link";
import { BrandMark } from "./brand-mark";
import { MobileMenu } from "./mobile-menu";
import styles from "./public-header.module.css";

const fallbackNavigation = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/services", label: "Services" },
  { href: "/videos", label: "Videos" },
  { href: "/press", label: "Press" },
  { href: "/events", label: "Events" },
] as const;

type NavItem = { href: string; label: string };

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
    <ul
      ref={capsuleRef}
      className={styles.navList}
      data-testid="nav-capsule"
    >
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
      {navigation.map((item) => (
        <li key={item.href}>
          <Link
            ref={(node) => {
              if (node) itemRefs.current.set(item.href, node);
              else itemRefs.current.delete(item.href);
            }}
            className={`${styles.navLink} ${tone(item.href)}`}
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
      ))}
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
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
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
            <NavCapsule currentPath={currentPath} navigation={navigation} />
          </nav>

          <div className={styles.actions}>
            <SupportButton className={styles.support} label="Support" />
            <ButtonLink className={styles.cta} href={safeCTA.href}>
              {safeCTA.label}
            </ButtonLink>
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
        navigation={navigation}
        brandName={safeBrandName}
        cta={safeCTA}
      />
    </>
  );
}
