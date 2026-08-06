import type { Metadata } from "next";
import { Scanner } from "../../../components/admin/checkin/scanner";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Check-in",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/tickets", label: "Tickets & Orders" },
  { href: "/admin/checkin", label: "Check-in" },
  { href: "/admin/events", label: "Events" },
] as const;

export default function AdminCheckinPage() {
  return (
    <AdminShell currentPath="/admin/checkin" navigation={navigation} title="Check-in">
      <Scanner />
    </AdminShell>
  );
}
