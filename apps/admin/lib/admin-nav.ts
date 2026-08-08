import type { Icon } from "@phosphor-icons/react";
import {
  Storefront,
  AddressBook,
  Archive,
  Article,
  CalendarBlank,
  CalendarCheck,
  ChartBar,
  CheckSquare,
  CirclesThreePlus,
  ClockCounterClockwise,
  EnvelopeSimple,
  Export,
  GearSix,
  House,
  IdentificationCard,
  ImageSquare,
  LockKey,
  MagnifyingGlass,
  Megaphone,
  Newspaper,
  PresentationChart,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: Icon;
};

export type AdminNavGroup = {
  heading: string;
  icon: Icon;
  items: readonly AdminNavItem[];
};

/** Canonical staff navigation — same rail on every admin page. */
export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    heading: "Home",
    icon: House,
    items: [{ href: "/", label: "Overview", icon: PresentationChart }],
  },
  {
    heading: "Publish",
    icon: Article,
    items: [
      { href: "/content", label: "Content", icon: Newspaper },
      { href: "/media", label: "Media", icon: ImageSquare },
      { href: "/merch", label: "Merchandise", icon: Storefront },
      { href: "/services", label: "Services", icon: CirclesThreePlus },
      { href: "/settings", label: "Site settings", icon: GearSix },
    ],
  },
  {
    heading: "Live & tickets",
    icon: Ticket,
    items: [
      { href: "/events", label: "Events", icon: CalendarBlank },
      { href: "/tickets", label: "Tickets & orders", icon: Ticket },
      { href: "/checkin", label: "Check-in", icon: CheckSquare },
      {
        href: "/ticket-analytics",
        label: "Ticket analytics",
        icon: ChartBar,
      },
    ],
  },
  {
    heading: "Pipeline",
    icon: AddressBook,
    items: [
      { href: "/crm", label: "CRM", icon: AddressBook },
      { href: "/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/newsletter", label: "Newsletter", icon: EnvelopeSimple },
      { href: "/search", label: "Search", icon: MagnifyingGlass },
    ],
  },
  {
    heading: "Team",
    icon: UsersThree,
    items: [
      { href: "/team", label: "Users & roles", icon: UsersThree },
      { href: "/permissions", label: "Permissions", icon: ShieldCheck },
    ],
  },
  {
    heading: "Account",
    icon: UserCircle,
    items: [
      { href: "/account", label: "Profile", icon: IdentificationCard },
      { href: "/account/security", label: "Security", icon: LockKey },
      {
        href: "/account/preferences",
        label: "Preferences",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    heading: "Governance",
    icon: Archive,
    items: [
      { href: "/analytics", label: "Analytics", icon: ChartBar },
      { href: "/exports", label: "Exports", icon: Export },
      { href: "/audit", label: "Audit", icon: ClockCounterClockwise },
      { href: "/privacy", label: "Privacy", icon: ShieldCheck },
    ],
  },
] as const;

export function adminNavFlat(): AdminNavItem[] {
  return ADMIN_NAV_GROUPS.flatMap((group) => [...group.items]);
}

export function isAdminNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  booking_manager: "Booking manager",
  content_editor: "Content editor",
  analyst: "Analyst",
};
