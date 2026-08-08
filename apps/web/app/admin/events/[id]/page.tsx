import type { Metadata } from "next";

import { EventEditor } from "../../../../components/admin/events/event-editor";

export const metadata: Metadata = {
  title: "Event",
  robots: { index: false, follow: false },
};

export default async function AdminEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EventEditor eventID={id} />;
}
