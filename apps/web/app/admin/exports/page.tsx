import type { Metadata } from "next";
import { ExportsWorkspace } from "../../../components/admin/exports/exports-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Exports",
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

export default function ExportsPage() {
  return (
    <AdminShell currentPath="/admin/exports" navigation={navigation} title="Exports">
      <ExportsWorkspace />
    </AdminShell>
  );
}
