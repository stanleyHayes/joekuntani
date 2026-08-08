"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AdminShell } from "../components/layout/admin-shell";
import { adminPageMeta } from "../lib/admin-page-meta";

/**
 * The staff chrome renders here, not inside each page, so React keeps the same
 * shell mounted across navigation. When it lived in `page.tsx` every route
 * change unmounted the sidebar, which reset its independent scroll position and
 * threw away collapsed/expanded state.
 *
 * `/login`, its MFA step, and `/accept-invite` sit under this
 * segment but must render bare — signing in, or activating an account that has
 * no password yet, through a shell that assumes a session would be nonsense. A
 * route group would express that in the file tree, but it would mean relocating
 * every workspace route, so the check lives here instead.
 */
export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/accept-invite") ||
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/admin/accept-invite")
  ) {
    return <>{children}</>;
  }

  const meta = adminPageMeta(pathname);
  return (
    <AdminShell title={meta.title} description={meta.description}>
      {children}
    </AdminShell>
  );
}
