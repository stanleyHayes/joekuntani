export type NavItem = {
  href: string;
  label: string;
  children?: readonly NavItem[];
};

/**
 * Used whenever published settings are unavailable — a cold or unreachable API
 * must not strip the site's navigation down to nothing. Shared by the header,
 * the mobile menu and the mobile bottom bar so a settings outage degrades them
 * identically instead of leaving the bar with two links and the header with
 * seven.
 */
export const fallbackNavigation: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/services", label: "Services" },
  { href: "/videos", label: "Videos" },
  { href: "/press", label: "Press" },
  { href: "/events", label: "Events" },
] as const;
