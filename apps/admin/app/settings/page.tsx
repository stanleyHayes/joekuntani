import type { Metadata } from "next";
import { SettingsForm } from "../../components/settings/settings-form";

export const metadata: Metadata = {
  title: "Global settings",
  robots: { index: false, follow: false },
};
export default function SettingsPage() {
  return <SettingsForm />;
}
