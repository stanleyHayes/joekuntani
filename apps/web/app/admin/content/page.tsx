import type { Metadata } from "next";
import { CMSWorkspace } from "../../../components/admin/content/cms-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Content",
  robots: { index: false, follow: false },
};
const navigation = [
  { href: "/admin/settings", label: "Global settings" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/media", label: "Media" },
] as const;
export default function AdminContentPage() {
  return (
    <AdminShell
      currentPath="/admin/content"
      navigation={navigation}
      title="Content"
    >
      <CMSWorkspace />
    </AdminShell>
  );
}
