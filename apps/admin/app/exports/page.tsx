import type { Metadata } from "next";
import { ExportsWorkspace } from "../../components/exports/exports-workspace";
import { SectionSwitcher } from "../../components/section-switcher";

export const metadata: Metadata = {
  title: "Exports",
  robots: { index: false, follow: false },
};

export default function ExportsPage() {
  return (
    <div className="governance-page">
      <SectionSwitcher section="governance" current="/exports" />
      <ExportsWorkspace />
    </div>
  );
}
