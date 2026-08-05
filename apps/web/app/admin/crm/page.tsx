import type { Metadata } from "next";
import { CRMWorkspace } from "../../../components/admin/crm/crm-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "CRM and enquiries",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/settings", label: "Global settings" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/crm", label: "CRM" },
] as const;

export default function CRMPage() {
  return (
    <AdminShell
      currentPath="/admin/crm"
      navigation={navigation}
      title="CRM and enquiries"
    >
      <CRMWorkspace />
    </AdminShell>
  );
}
