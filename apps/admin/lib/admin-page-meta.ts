/**
 * Titles for the admin topbar, keyed by route.
 *
 * These used to be passed per page into `<AdminShell>`. The shell now lives in
 * `app/layout.tsx` so it survives navigation, and a layout cannot read a
 * child page's props — so the mapping lives here instead.
 */
export type AdminPageMeta = {
  title: string;
  description?: string;
};

const ADMIN_PAGE_META: Record<string, AdminPageMeta> = {
  "/": {
    title: "Overview",
    description:
      "Command centre for Joe Kuntani — publish the brand, run live shows, and keep the pipeline clean.",
  },
  "/account": {
    title: "Profile",
    description: "Your staff identity across Joe Kuntani administration.",
  },
  "/account/preferences": {
    title: "Preferences",
    description: "Alerts, density, and timezone for your workspace.",
  },
  "/account/security": {
    title: "Security",
    description: "Password and authenticator controls for your staff session.",
  },
  "/analytics": { title: "Analytics" },
  "/audit": { title: "Audit" },
  "/bookings": { title: "Booking calendar" },
  "/campaigns": { title: "Campaigns" },
  "/checkin": { title: "Check-in" },
  "/content": { title: "Content" },
  "/crm": { title: "CRM and enquiries" },
  "/events": { title: "Events and ticket types" },
  "/exports": { title: "Exports" },
  "/merch": {
    title: "Merchandise",
    description: "Products, variants, stock and shop orders.",
  },
  "/media": {
    title: "Media",
    description: "Library assets for the public brand surfaces.",
  },
  "/newsletter": {
    title: "Newsletter",
    description: "Consent-backed public signups ready for audience sync.",
  },
  "/permissions": {
    title: "Permissions",
    description:
      "Read-only matrix of what each staff role can do on the server.",
  },
  "/privacy": { title: "Privacy" },
  "/search": { title: "Search" },
  "/services": { title: "Services" },
  "/settings": { title: "Global settings" },
  "/team": {
    title: "Users & roles",
    description:
      "Provision staff, assign the four server roles, and disable accounts.",
  },
  "/ticket-analytics": { title: "Ticket analytics" },
  "/tickets": { title: "Tickets & orders" },
};

/**
 * Longest-prefix match, so `/account/security` resolves to its own entry
 * rather than falling back to `/account`, and an unmapped detail route
 * inherits its section's title instead of rendering blank.
 */
export function adminPageMeta(pathname: string): AdminPageMeta {
  const exact = ADMIN_PAGE_META[pathname];
  if (exact) return exact;

  let best: AdminPageMeta | undefined;
  let bestLength = -1;
  for (const [route, meta] of Object.entries(ADMIN_PAGE_META)) {
    if (route === "/") continue;
    if (pathname.startsWith(`${route}/`) && route.length > bestLength) {
      best = meta;
      bestLength = route.length;
    }
  }
  return best ?? ADMIN_PAGE_META["/"];
}
