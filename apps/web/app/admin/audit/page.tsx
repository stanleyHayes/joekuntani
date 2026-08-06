import type { Metadata } from "next";
import { AuditWorkspace } from "../../../components/admin/audit/audit-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Audit",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/exports", label: "Exports" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/search", label: "Search" },
  { href: "/admin/crm", label: "CRM" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/campaigns", label: "Campaigns" },
] as const;

export default function AuditPage() {
  return (
    <AdminShell currentPath="/admin/audit" navigation={navigation} title="Audit">
      <AuditWorkspace />
    </AdminShell>
  );
}
