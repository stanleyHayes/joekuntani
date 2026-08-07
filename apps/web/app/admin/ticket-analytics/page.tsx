import type { Metadata } from "next";
import { TicketAnalyticsWorkspace } from "../../../components/admin/ticket-analytics/ticket-analytics-workspace";

export const metadata: Metadata = {
  title: "Ticket analytics",
  robots: { index: false, follow: false },
};

export default function TicketAnalyticsPage() {
  return <TicketAnalyticsWorkspace />;
}
