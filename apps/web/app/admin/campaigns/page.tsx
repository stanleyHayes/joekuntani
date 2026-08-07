import type { Metadata } from "next";
import { CampaignWorkspace } from "../../../components/admin/campaigns/campaign-workspace";

export const metadata: Metadata = {
  title: "Campaigns",
  robots: { index: false, follow: false },
};
export default function CampaignsPage() {
  return <CampaignWorkspace />;
}
