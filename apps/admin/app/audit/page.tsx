import type { Metadata } from "next";
import { AuditWorkspace } from "../../components/audit/audit-workspace";

export const metadata: Metadata = {
  title: "Audit",
  robots: { index: false, follow: false },
};

export default function AuditPage() {
  return <AuditWorkspace />;
}
