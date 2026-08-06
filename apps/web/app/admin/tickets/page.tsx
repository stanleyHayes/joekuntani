import { AdminShell } from "../../../components/layout/admin-shell";
import { TicketOperations } from "../../../components/admin/ticket-ops/ticket-operations";
export default function AdminTicketsPage() {
  return (
    <AdminShell
      currentPath="/admin/tickets"
      navigation={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/tickets", label: "Tickets & Orders" },
        { href: "/admin/checkin", label: "Check-in" },
      ]}
      title="Tickets & Orders"
    >
      <TicketOperations />
    </AdminShell>
  );
}
