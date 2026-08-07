import type { Metadata } from "next";
import { PreferencesWorkspace } from "@/components/admin/account/account-workspace";

export const metadata: Metadata = {
  title: "Preferences",
  robots: { index: false, follow: false },
};

export default function AdminPreferencesPage() {
  return <PreferencesWorkspace />;
}
