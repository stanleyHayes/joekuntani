import type { Metadata } from "next";
import { PrivacyWorkspace } from "../../../components/admin/privacy/privacy-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/privacy", label: "Privacy" },
  { href: "/admin/exports", label: "Exports" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/crm", label: "CRM" },
  { href: "/admin/search", label: "Search" },
] as const;

export default function PrivacyPage() {
  return (
    <AdminShell currentPath="/admin/privacy" navigation={navigation} title="Privacy">
      <PrivacyWorkspace />
    </AdminShell>
  );
}
