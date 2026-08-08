import type { Metadata } from "next";
import { PrivacyWorkspace } from "../../components/privacy/privacy-workspace";
import { SectionSwitcher } from "../../components/section-switcher";

export const metadata: Metadata = {
  title: "Privacy",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <div className="governance-page">
      <SectionSwitcher section="governance" current="/privacy" />
      <PrivacyWorkspace />
    </div>
  );
}
