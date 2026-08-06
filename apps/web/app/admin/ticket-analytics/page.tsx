import type { Metadata } from "next";
import { TicketAnalyticsWorkspace } from "../../../components/admin/ticket-analytics/ticket-analytics-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Ticket analytics",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/ticket-analytics", label: "Ticket analytics" },
  { href: "/admin/tickets", label: "Tickets & Orders" },
  { href: "/admin/checkin", label: "Check-in" },
] as const;

export default function TicketAnalyticsPage() {
  return (
    <AdminShell currentPath="/admin/ticket-analytics" navigation={navigation} title="Ticket analytics">
      <TicketAnalyticsWorkspace />
    </AdminShell>
  );
}
