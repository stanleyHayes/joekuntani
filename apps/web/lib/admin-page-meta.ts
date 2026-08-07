/**
 * Titles for the admin topbar, keyed by route.
 *
 * These used to be passed per page into `<AdminShell>`. The shell now lives in
 * `app/admin/layout.tsx` so it survives navigation, and a layout cannot read a
 * child page's props — so the mapping lives here instead.
 */
export type AdminPageMeta = {
  title: string;
  description?: string;
};

const ADMIN_PAGE_META: Record<string, AdminPageMeta> = {
  "/admin": {
    title: "Overview",
    description:
      "Command centre for Joe Kuntani — publish the brand, run live shows, and keep the pipeline clean.",
  },
  "/admin/account": {
    title: "Profile",
    description: "Your staff identity across Joe Kuntani administration.",
  },
  "/admin/account/preferences": {
    title: "Preferences",
    description: "Alerts, density, and timezone for your workspace.",
  },
  "/admin/account/security": {
    title: "Security",
    description: "Password and authenticator controls for your staff session.",
  },
  "/admin/analytics": { title: "Analytics" },
  "/admin/audit": { title: "Audit" },
  "/admin/bookings": { title: "Booking calendar" },
  "/admin/campaigns": { title: "Campaigns" },
  "/admin/checkin": { title: "Check-in" },
  "/admin/content": { title: "Content" },
  "/admin/crm": { title: "CRM and enquiries" },
  "/admin/events": { title: "Events and ticket types" },
  "/admin/exports": { title: "Exports" },
  "/admin/media": {
    title: "Media",
    description: "Library assets for the public brand surfaces.",
  },
  "/admin/newsletter": {
    title: "Newsletter",
    description: "Consent-backed public signups ready for audience sync.",
  },
  "/admin/permissions": {
    title: "Permissions",
    description:
      "Read-only matrix of what each staff role can do on the server.",
  },
  "/admin/privacy": { title: "Privacy" },
  "/admin/search": { title: "Search" },
  "/admin/services": { title: "Services" },
  "/admin/settings": { title: "Global settings" },
  "/admin/team": {
    title: "Users & roles",
    description:
      "Provision staff, assign the four server roles, and disable accounts.",
  },
  "/admin/ticket-analytics": { title: "Ticket analytics" },
  "/admin/tickets": { title: "Tickets & orders" },
};

/**
 * Longest-prefix match, so `/admin/account/security` resolves to its own entry
 * rather than falling back to `/admin/account`, and an unmapped detail route
 * inherits its section's title instead of rendering blank.
 */
export function adminPageMeta(pathname: string): AdminPageMeta {
  const exact = ADMIN_PAGE_META[pathname];
  if (exact) return exact;

  let best: AdminPageMeta | undefined;
  let bestLength = -1;
  for (const [route, meta] of Object.entries(ADMIN_PAGE_META)) {
    if (route === "/admin") continue;
    if (pathname.startsWith(`${route}/`) && route.length > bestLength) {
      best = meta;
      bestLength = route.length;
    }
  }
  return best ?? ADMIN_PAGE_META["/admin"];
}
