import type { Metadata } from "next";
import { AnalyticsWorkspace } from "../../components/analytics/analytics-workspace";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default function AnalyticsPage() {
  return <AnalyticsWorkspace />;
}
