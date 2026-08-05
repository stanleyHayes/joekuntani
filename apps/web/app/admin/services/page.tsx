import type { Metadata } from "next";

import { ServiceManager } from "../../../components/admin/services/service-manager";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Services",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin/settings", label: "Global settings" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/media", label: "Media" },
] as const;

export default function AdminServicesPage() {
  return (
    <AdminShell
      currentPath="/admin/services"
      navigation={navigation}
      title="Services"
    >
      <ServiceManager />
    </AdminShell>
  );
}
