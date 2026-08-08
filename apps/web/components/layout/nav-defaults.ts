/**
 * Icon keys rather than components: navigation can arrive from published
 * settings as JSON, so anything in a NavItem has to survive a round trip
 * through the API. The header maps these names to real icons.
 */
export type NavIcon =
  | "home"
  | "about"
  | "work"
  | "services"
  | "videos"
  | "press"
  | "events"
  | "shop";

export type NavItem = {
  href: string;
  label: string;
  /** One line saying what is behind the link, shown in dropdown menus. */
  description?: string;
  icon?: NavIcon;
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
  { href: "/", label: "Home", icon: "home" },
  {
    href: "/about",
    label: "About",
    icon: "about",
    description: "Who Joe is and how the show works.",
  },
  {
    href: "/work",
    label: "Work",
    icon: "work",
    description: "Formats, case studies and past rooms.",
  },
  {
    href: "/services",
    label: "Services",
    icon: "services",
    description: "What can be booked, and what each includes.",
  },
  {
    href: "/media/videos",
    label: "Videos",
    icon: "videos",
    description: "Reels, live clips and interview cuts.",
  },
  {
    href: "/media/press",
    label: "Press",
    icon: "press",
    description: "Interviews, features and coverage.",
  },
  {
    href: "/events",
    label: "Events",
    icon: "events",
    description: "Upcoming dates and tickets.",
  },
  {
    href: "/shop",
    label: "Shop",
    icon: "shop",
    description: "Official merchandise, shipped from Ghana.",
  },
] as const;

export const SHOP_NAVIGATION: NavItem = {
  href: "/shop",
  label: "Shop",
  icon: "shop",
  description: "Official merchandise, shipped from Ghana.",
};

/** The published storefront must stay discoverable even when old CMS settings omit it. */
export function withShopNavigation(navigation: readonly NavItem[]): NavItem[] {
  return navigation.some((item) => item.href === SHOP_NAVIGATION.href)
    ? [...navigation]
    : [...navigation, SHOP_NAVIGATION];
}

/**
 * Copy for links that arrive from settings without any of their own.
 *
 * A settings-driven nav carries only href and label, so a dropdown built from
 * it would show bare titles. Keyed by href so an editor renaming a link keeps
 * its description and icon.
 */
export const navMetadataByHref: Record<
  string,
  { description: string; icon: NavIcon }
> = {
  "/": { description: "Back to the start.", icon: "home" },
  "/about": {
    description: "Who Joe is and how the show works.",
    icon: "about",
  },
  "/work": {
    description: "Formats, case studies and past rooms.",
    icon: "work",
  },
  "/services": {
    description: "What can be booked, and what each includes.",
    icon: "services",
  },
  "/videos": {
    description: "Reels, live clips and interview cuts.",
    icon: "videos",
  },
  "/press": {
    description: "Interviews, features and coverage.",
    icon: "press",
  },
  "/media/videos": {
    description: "Reels, live clips and interview cuts.",
    icon: "videos",
  },
  "/media/press": {
    description: "Interviews, features and coverage.",
    icon: "press",
  },
  "/events": { description: "Upcoming dates and tickets.", icon: "events" },
  "/shop": {
    description: "Official merchandise, shipped from Ghana.",
    icon: "shop",
  },
};

/** Fills in description and icon for a link that carries neither. */
export function withNavMetadata(item: NavItem): NavItem {
  const metadata = navMetadataByHref[item.href];
  if (!metadata) return item;
  return {
    ...item,
    description: item.description ?? metadata.description,
    icon: item.icon ?? metadata.icon,
  };
}
