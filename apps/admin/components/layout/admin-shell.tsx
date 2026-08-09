"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretDown, Check, SidebarSimple } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ADMIN_NAV_GROUPS,
  isAdminNavActive,
  type AdminNavGroup,
  type AdminNavItem,
} from "../../lib/admin-nav";
import { ThemeProvider } from "@joe-kuntani/shared/theme/theme-provider";
import { ThemeToggle } from "@joe-kuntani/shared/theme/theme-toggle";
import { ContentIncompleteWarning } from "@joe-kuntani/shared/ui/content-incomplete-warning";
import { AdminTour, shouldAutoStartTour } from "../admin-tour";
import { AdminUserMenu } from "../admin-user-menu";
import { AdminPageGuide } from "../page-guide";
import { AdminSplash } from "../admin-splash";
import {
  AdminNotificationsProvider,
  NotificationBell,
  useAdminNotifications,
} from "../notifications/admin-notifications";
import { BrandMark } from "@joe-kuntani/shared/ui/brand-mark";
import styles from "./admin-shell.module.css";
import "./admin-stage.css";

export type AdminNavigationItem = AdminNavItem;

const GROUPS_KEY = "jk.admin.nav.groups";
const COLLAPSE_KEY = "jk.admin.nav.collapsed";
let splashShownThisRuntime = false;

function initialSplashState() {
  if (typeof window === "undefined") return true;
  if (splashShownThisRuntime) return false;
  splashShownThisRuntime = true;
  return true;
}

type AdminShellProps = {
  children: ReactNode;
  currentPath?: string;
  missingContentCount?: number;
  /** @deprecated Canonical grouped nav is always used. */
  navigation?: readonly AdminNavItem[];
  title: string;
  description?: string;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function Connector({ last, active }: { last: boolean; active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={styles.connector}
      data-active={active ? "true" : "false"}
    >
      <path
        d={last ? "M7 0 V17 Q7 23 13 23 H24" : "M7 0 V40 M7 23 Q7 23 13 23 H24"}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AdminShell({
  children,
  currentPath,
  missingContentCount,
  title,
  description,
}: AdminShellProps) {
  const routerPath = usePathname();
  const pathname = currentPath || routerPath || "/admin";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [splashOpen, setSplashOpen] = useState(initialSplashState);
  const panelId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setCollapsed(readJson(COLLAPSE_KEY, false));
      setHydrated(true);
    }, 0);
    const tourTimer = window.setTimeout(() => {
      if (shouldAutoStartTour()) setTourOpen(true);
    }, 900);
    return () => {
      window.clearTimeout(hydrateTimer);
      window.clearTimeout(tourTimer);
    };
  }, []);

  useEffect(() => {
    if (!splashOpen) return;
    const timer = window.setTimeout(() => setSplashOpen(false), 1100);
    return () => window.clearTimeout(timer);
  }, [splashOpen]);

  // Close on navigation. `routerPath` is tracked as well as the resolved
  // `pathname` because every admin page pins a static `currentPath` prop.
  // Adjusted during render (React's documented "reset state when a prop
  // changes" pattern) rather than in an effect, which would queue a second
  // render pass after the drawer had already painted at the new route.
  const navigationKey = `${pathname}\u0000${routerPath ?? ""}`;
  const [lastNavigationKey, setLastNavigationKey] = useState(navigationKey);
  if (lastNavigationKey !== navigationKey) {
    setLastNavigationKey(navigationKey);
    setMobileOpen(false);
  }

  // Modal drawer behaviour: focus moves in, Tab is trapped, Escape closes and
  // focus returns to the trigger.
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    const trigger = menuButtonRef.current;
    drawer?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || active === drawer)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const viewport = document.documentElement.clientWidth;
    const scrollbar = viewport > 0 ? window.innerWidth - viewport : 0;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [mobileOpen]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <ThemeProvider>
      <AdminNotificationsProvider>
        <div
          className={styles.frame}
          data-admin-frame=""
          data-collapsed={hydrated && collapsed ? "true" : "false"}
          data-mobile-nav={mobileOpen ? "open" : "closed"}
        >
          {splashOpen ? <AdminSplash overlay /> : null}
          <a className="skip-link" href="#admin-main-content">
            Skip to workspace
          </a>

          <aside className={styles.sidebar} aria-label="Administration">
            <SidebarChrome
              collapsed={hydrated && collapsed}
              onToggleCollapsed={toggleCollapsed}
              onNavigate={() => setMobileOpen(false)}
            />
            <AdminNav
              pathname={pathname}
              collapsed={hydrated && collapsed}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className={styles.sidebarFoot} data-collapsed-hide="">
              <p className={styles.sidebarFootNote}>
                Joe Kuntani · Africa/Accra
              </p>
            </div>
          </aside>

          {mobileOpen ? (
            <>
              <button
                type="button"
                className={styles.scrim}
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
              />
              <div
                className={styles.drawer}
                id={panelId}
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                tabIndex={-1}
              >
                <SidebarChrome
                  collapsed={false}
                  onToggleCollapsed={toggleCollapsed}
                  onNavigate={() => setMobileOpen(false)}
                  showCollapse={false}
                />
                <AdminNav
                  pathname={pathname}
                  collapsed={false}
                  onNavigate={() => setMobileOpen(false)}
                />
                <div className={styles.drawerFoot}>
                  <Link
                    className={styles.drawerLink}
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setMobileOpen(false)}
                  >
                    Public site
                  </Link>
                  <p className={styles.sidebarFootNote}>
                    Joe Kuntani · Africa/Accra
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div id={panelId} hidden />
          )}

          <div className={styles.stage}>
            <header className={styles.topbar}>
              <div className={styles.topbarStart}>
                <button
                  type="button"
                  className={styles.menuButton}
                  ref={menuButtonRef}
                  aria-expanded={mobileOpen}
                  aria-controls={panelId}
                  onClick={() => setMobileOpen((value) => !value)}
                >
                  <SidebarSimple size={17} weight="bold" aria-hidden="true" />
                  <span>Menu</span>
                </button>
                <button
                  type="button"
                  className={styles.railButton}
                  aria-pressed={collapsed}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  onClick={toggleCollapsed}
                >
                  <SidebarSimple
                    size={18}
                    weight="regular"
                    mirrored={!collapsed}
                    aria-hidden="true"
                  />
                </button>
              </div>
              <div className={styles.pageIntro}>
                <p className={styles.pageEyebrow}>Administration</p>
                <h1 className={styles.pageTitle}>{title}</h1>
                {description ? (
                  <p className={styles.pageDescription}>{description}</p>
                ) : null}
              </div>
              <div className={styles.topbarActions}>
                <NotificationBell />
                <ThemeToggle />
                <Link
                  className={styles.publicLink}
                  href="/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Public site
                </Link>
                <AdminUserMenu onReplayTour={() => setTourOpen(true)} />
              </div>
            </header>

            <main className={styles.main} id="admin-main-content">
              {(missingContentCount ?? 0) > 0 ? (
                <ContentIncompleteWarning missingCount={missingContentCount} />
              ) : null}
              {/* Above the workspace rather than inside it: the guide describes
                  the whole page, and every route would otherwise have to
                  remember to render it. */}
              <AdminPageGuide title={title} />
              <div key={pathname} className="admin-stage" data-route-stage="">
                {children}
              </div>
            </main>
          </div>
          {tourOpen ? <AdminTour onDone={() => setTourOpen(false)} /> : null}
        </div>
      </AdminNotificationsProvider>
    </ThemeProvider>
  );
}

function SidebarChrome({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  showCollapse = true,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
  showCollapse?: boolean;
}) {
  return (
    <div className={styles.brandBlock}>
      <div className={styles.brandRow}>
        <Link className={styles.brandLink} href="/admin" onClick={onNavigate}>
          <BrandMark brandName="Joe Kuntani" size="sm" />
        </Link>
        {showCollapse ? (
          <button
            type="button"
            className={styles.collapseButton}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapsed}
          >
            <SidebarSimple
              size={18}
              weight="regular"
              mirrored={!collapsed}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
      <div className={styles.workspaceChip} data-collapsed-hide="">
        <p className={styles.workspaceEyebrow}>Live workspace</p>
        <p className={styles.workspaceName}>Staff command</p>
      </div>
    </div>
  );
}

function AdminNav({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const notifications = useAdminNotifications();
  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timer = window.setTimeout(
      () => setOpenState(readJson<Record<string, boolean>>(GROUPS_KEY, {})),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const activeHref = useMemo(() => {
    return ADMIN_NAV_GROUPS.flatMap((group) => [...group.items])
      .filter((item) => isAdminNavActive(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  }, [pathname]);

  const toggle = useCallback((heading: string) => {
    setOpenState((cur) => {
      const next = { ...cur, [heading]: !(cur[heading] ?? true) };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <nav className={styles.nav} aria-label="Administration">
      <span className={styles.watermark} aria-hidden="true">
        J
      </span>
      {ADMIN_NAV_GROUPS.map((group) => (
        <NavGroupBlock
          key={group.heading}
          group={group}
          activeHref={activeHref}
          collapsed={collapsed}
          openState={openState}
          onToggle={toggle}
          onNavigate={onNavigate}
          badgeFor={notifications.badgeFor}
        />
      ))}
    </nav>
  );
}

function NavGroupBlock({
  group,
  activeHref,
  collapsed,
  openState,
  onToggle,
  onNavigate,
  badgeFor,
}: {
  group: AdminNavGroup;
  activeHref?: string;
  collapsed: boolean;
  openState: Record<string, boolean>;
  onToggle: (heading: string) => void;
  onNavigate: () => void;
  badgeFor: (href: string) => number;
}) {
  const hasActive = group.items.some((item) => item.href === activeHref);
  const isOpen = hasActive || (openState[group.heading] ?? true);
  const panelId = `nav-${group.heading.replace(/\s+/g, "-").toLowerCase()}`;
  const GroupIcon = group.icon;

  return (
    <div className={styles.navGroup}>
      <button
        type="button"
        className={styles.navHeading}
        onClick={() => onToggle(group.heading)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        title={collapsed ? group.heading : undefined}
        data-active-group={hasActive ? "true" : "false"}
      >
        <span className={styles.navHeadingMain}>
          <GroupIcon
            className={styles.groupIcon}
            size={15}
            weight={hasActive ? "fill" : "regular"}
            aria-hidden="true"
          />
          <span className={styles.navHeadingLabel}>{group.heading}</span>
        </span>
        <CaretDown
          className={styles.chevron}
          data-open={isOpen ? "true" : "false"}
          size={12}
          weight="bold"
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        className={styles.navPanel}
        data-open={isOpen ? "true" : "false"}
      >
        <div className={styles.navPanelInner}>
          {group.items.map((item, index) => {
            const active = item.href === activeHref;
            const badge = badgeFor(item.href);
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : "false"}
                title={collapsed ? item.label : undefined}
                onClick={onNavigate}
              >
                {!collapsed ? (
                  <Connector
                    last={index === group.items.length - 1}
                    active={active}
                  />
                ) : null}
                {active ? (
                  <span className={styles.activeBar} aria-hidden="true" />
                ) : null}
                <ItemIcon
                  className={styles.navItemIcon}
                  size={17}
                  weight={active ? "fill" : "regular"}
                  aria-hidden="true"
                />
                <span className={styles.navLabel}>{item.label}</span>
                {badge ? (
                  <span
                    className={styles.navBadge}
                    aria-label={`${badge} unread notifications`}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : active && !collapsed ? (
                  <Check
                    className={styles.tick}
                    size={14}
                    weight="bold"
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
