import type { Metadata } from "next";

import { EventManager } from "../../../components/admin/events/event-manager";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Events and ticket types",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/settings", label: "Global settings" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/events", label: "Events" },
] as const;

export default function AdminEventsPage() {
  return (
    <AdminShell
      currentPath="/admin/events"
      navigation={navigation}
      title="Events and ticket types"
    >
      <section aria-labelledby="events-workspace-heading">
        <header>
          <p>Ticketing operations</p>
          <h2 id="events-workspace-heading">Event workspace</h2>
          <p>
            Create private drafts, verify the protected preview, then publish
            through explicit audited actions.
          </p>
        </header>
        <EventManager />
      </section>
    </AdminShell>
  );
}
