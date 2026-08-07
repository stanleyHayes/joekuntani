import type { Metadata } from "next";
import { ExportsWorkspace } from "../../../components/admin/exports/exports-workspace";

export const metadata: Metadata = {
  title: "Exports",
  robots: { index: false, follow: false },
};

export default function ExportsPage() {
  return <ExportsWorkspace />;
}
