import type { Metadata } from "next";

import { EventManager } from "../../../components/admin/events/event-manager";

export const metadata: Metadata = {
  title: "Events and ticket types",
  robots: { index: false, follow: false },
};

export default function AdminEventsPage() {
  return (
    <section aria-labelledby="events-title">
      <EventManager />
    </section>
  );
}
