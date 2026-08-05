import type { Metadata } from "next";
import { SettingsForm } from "../../../components/admin/settings/settings-form";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Global settings",
  robots: { index: false, follow: false },
};
const navigation = [
  { href: "/admin/settings", label: "Global settings" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/media", label: "Media" },
] as const;
export default function SettingsPage() {
  return (
    <AdminShell
      currentPath="/admin/settings"
      navigation={navigation}
      title="Global settings"
    >
      <SettingsForm />
    </AdminShell>
  );
}
