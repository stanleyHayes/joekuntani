import type { ReactNode } from "react";

/**
 * Route icons, keyed by the top-level segment rather than the full path so a
 * Settings-authored `/work/live-shows` still resolves. Settings owns the nav
 * links, so an unmapped route is expected, not a bug — those fall back to the
 * neutral marker below instead of rendering a gap.
 *
 * Shared by the full-screen mobile menu and the mobile bottom bar so a route
 * never carries two different marks.
 */
const NAV_ICONS: Record<string, ReactNode> = {
  "": (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.75v.5" />
    </>
  ),
  work: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  services: (
    <>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h6" />
      <path d="M14 17h6" />
      <circle cx="12" cy="17" r="2" />
    </>
  ),
  videos: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3.5" />
      <path d="M10.5 9.25 15 12l-4.5 2.75z" />
    </>
  ),
  media: (
    <>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5z" />
      <path d="m4 12.5 8 4.25 8-4.25" />
      <path d="m4 17 8 4.25L20 17" />
    </>
  ),
  press: (
    <>
      <path d="M4 5.5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
      <path d="M17 9.5h3v9a2 2 0 0 1-2 2" />
      <path d="M7.5 9h6" />
      <path d="M7.5 13h6" />
      <path d="M7.5 16.5h3.5" />
    </>
  ),
  events: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
  tickets: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v1a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5v-1a2.5 2.5 0 0 0 0-5z" />
      <path d="M13.5 8.5v7" strokeDasharray="1.5 2.5" />
    </>
  ),
  shop: (
    <>
      <path d="M5 8h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </>
  ),
  contact: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="m4.5 8 6.4 4.7a2 2 0 0 0 2.2 0L19.5 8" />
    </>
  ),
  support: (
    <>
      <path d="M12 20.5s-7.5-4.3-7.5-9.5a4.2 4.2 0 0 1 7.5-2.6A4.2 4.2 0 0 1 19.5 11c0 5.2-7.5 9.5-7.5 9.5z" />
    </>
  ),
  "media-kit": (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h3l2 2.5h6A2.5 2.5 0 0 1 20 10v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17z" />
    </>
  ),
  book: (
    <>
      <path d="m20.5 3.5-8 17-2.5-7-7-2.5z" />
      <path d="m20.5 3.5-10.5 9.5" />
    </>
  ),
};

const FALLBACK_ICON = <path d="m12 4 8 8-8 8-8-8z" />;

export function navIconFor(href: string) {
  const segment = href.replace(/^\/+/, "").split("/")[0]?.toLowerCase() ?? "";
  return NAV_ICONS[segment] ?? FALLBACK_ICON;
}

/** Always `aria-hidden` — the adjacent text label carries the accessible name. */
export function NavIcon({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {navIconFor(href)}
    </svg>
  );
}
