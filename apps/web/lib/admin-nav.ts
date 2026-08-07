import type { Icon } from "@phosphor-icons/react";
import {
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
    items: [{ href: "/admin", label: "Overview", icon: PresentationChart }],
  },
  {
    heading: "Publish",
    icon: Article,
    items: [
      { href: "/admin/content", label: "Content", icon: Newspaper },
      { href: "/admin/media", label: "Media", icon: ImageSquare },
      { href: "/admin/services", label: "Services", icon: CirclesThreePlus },
      { href: "/admin/settings", label: "Site settings", icon: GearSix },
    ],
  },
  {
    heading: "Live & tickets",
    icon: Ticket,
    items: [
      { href: "/admin/events", label: "Events", icon: CalendarBlank },
      { href: "/admin/tickets", label: "Tickets & orders", icon: Ticket },
      { href: "/admin/checkin", label: "Check-in", icon: CheckSquare },
      {
        href: "/admin/ticket-analytics",
        label: "Ticket analytics",
        icon: ChartBar,
      },
    ],
  },
  {
    heading: "Pipeline",
    icon: AddressBook,
    items: [
      { href: "/admin/crm", label: "CRM", icon: AddressBook },
      { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/admin/newsletter", label: "Newsletter", icon: EnvelopeSimple },
      { href: "/admin/search", label: "Search", icon: MagnifyingGlass },
    ],
  },
  {
    heading: "Team",
    icon: UsersThree,
    items: [
      { href: "/admin/team", label: "Users & roles", icon: UsersThree },
      { href: "/admin/permissions", label: "Permissions", icon: ShieldCheck },
    ],
  },
  {
    heading: "Account",
    icon: UserCircle,
    items: [
      { href: "/admin/account", label: "Profile", icon: IdentificationCard },
      { href: "/admin/account/security", label: "Security", icon: LockKey },
      {
        href: "/admin/account/preferences",
        label: "Preferences",
        icon: SlidersHorizontal,
      },
    ],
  },
  {
    heading: "Governance",
    icon: Archive,
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: ChartBar },
      { href: "/admin/exports", label: "Exports", icon: Export },
      { href: "/admin/audit", label: "Audit", icon: ClockCounterClockwise },
      { href: "/admin/privacy", label: "Privacy", icon: ShieldCheck },
    ],
  },
] as const;

export function adminNavFlat(): AdminNavItem[] {
  return ADMIN_NAV_GROUPS.flatMap((group) => [...group.items]);
}

export function isAdminNavActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/account") return pathname === "/admin/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  booking_manager: "Booking manager",
  content_editor: "Content editor",
  analyst: "Analyst",
};
