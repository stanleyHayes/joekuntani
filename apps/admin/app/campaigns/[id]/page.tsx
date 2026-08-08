import type { Metadata } from "next";
import { CampaignDetail } from "../../../components/campaigns/campaign-detail";
import { CampaignEditor } from "../../../components/campaigns/campaign-editor";

export const metadata: Metadata = {
  title: "Campaign",
  robots: { index: false, follow: false },
};

export default async function AdminCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return id === "new" ? <CampaignEditor /> : <CampaignDetail campaignID={id} />;
}
