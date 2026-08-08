import type { Metadata } from "next";
import { CRMWorkspace } from "../../components/crm/crm-workspace";

export const metadata: Metadata = {
  title: "CRM and enquiries",
  robots: { index: false, follow: false },
};

export default function CRMPage() {
  return <CRMWorkspace />;
}
