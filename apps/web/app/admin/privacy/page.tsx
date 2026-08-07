import type { Metadata } from "next";
import { PrivacyWorkspace } from "../../../components/admin/privacy/privacy-workspace";

export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return <PrivacyWorkspace />;
}
