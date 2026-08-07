import type { Metadata } from "next";
import { AnalyticsWorkspace } from "../../../components/admin/analytics/analytics-workspace";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default function AnalyticsPage() {
  return <AnalyticsWorkspace />;
}
