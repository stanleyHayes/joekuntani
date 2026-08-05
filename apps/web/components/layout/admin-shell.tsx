import Link from "next/link";
import type { ReactNode } from "react";

import { ContentIncompleteWarning } from "../ui/content-incomplete-warning";

export type AdminNavigationItem = {
  href: string;
  label: string;
};

type AdminShellProps = {
  children: ReactNode;
  currentPath?: string;
  missingContentCount?: number;
  navigation: readonly AdminNavigationItem[];
  title: string;
};

export function AdminShell({
  children,
  currentPath,
  missingContentCount,
  navigation,
  title,
}: AdminShellProps) {
  const serviceNavigation = navigation.some(
    (item) => item.href === "/admin/services",
  )
    ? navigation
    : [...navigation, { href: "/admin/services", label: "Services" }];
  const eventNavigation = serviceNavigation.some(
    (item) => item.href === "/admin/events",
  )
    ? serviceNavigation
    : [...serviceNavigation, { href: "/admin/events", label: "Events" }];
  const crmNavigation = eventNavigation.some(
    (item) => item.href === "/admin/crm",
  )
    ? eventNavigation
    : [...eventNavigation, { href: "/admin/crm", label: "CRM" }];
  const bookingNavigation = crmNavigation.some(
    (item) => item.href === "/admin/bookings",
  )
    ? crmNavigation
    : [...crmNavigation, { href: "/admin/bookings", label: "Bookings" }];
  const resolvedNavigation = bookingNavigation.some(
    (item) => item.href === "/admin/campaigns",
  )
    ? bookingNavigation
    : [...bookingNavigation, { href: "/admin/campaigns", label: "Campaigns" }];
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-main-content">
        Skip to workspace
      </a>
      <header className="admin-topbar">
        <Link
          className="wordmark"
          href="/admin"
          aria-label="Joe Kuntani admin home"
        >
          Joe Kuntani <span>Admin</span>
        </Link>
        <Link href="/" target="_blank" rel="noreferrer">
          View public site
        </Link>
      </header>
      <aside className="admin-sidebar">
        <nav aria-label="Administration">
          <ul>
            {resolvedNavigation.map((item) => (
              <li key={item.href}>
                <Link
                  aria-current={currentPath === item.href ? "page" : undefined}
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="admin-main" id="admin-main-content">
        <ContentIncompleteWarning missingCount={missingContentCount} />
        <header className="admin-page-header">
          <h1>{title}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}
