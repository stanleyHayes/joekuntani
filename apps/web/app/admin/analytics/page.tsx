import type { Metadata } from "next";
import { AnalyticsWorkspace } from "../../../components/admin/analytics/analytics-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/exports", label: "Exports" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/crm", label: "CRM" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/campaigns", label: "Campaigns" },
] as const;

export default function AnalyticsPage() {
  return (
    <AdminShell currentPath="/admin/analytics" navigation={navigation} title="Analytics">
      <AnalyticsWorkspace />
    </AdminShell>
  );
}
