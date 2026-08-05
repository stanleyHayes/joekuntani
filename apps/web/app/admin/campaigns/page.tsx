import type { Metadata } from "next";
import { CampaignWorkspace } from "../../../components/admin/campaigns/campaign-workspace";
import { AdminShell } from "../../../components/layout/admin-shell";

export const metadata: Metadata = {
  title: "Campaigns",
  robots: { index: false, follow: false },
};
const navigation = [
  { href: "/admin/content", label: "Content" },
  { href: "/admin/crm", label: "CRM" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/events", label: "Events" },
] as const;
export default function CampaignsPage() {
  return (
    <AdminShell
      currentPath="/admin/campaigns"
      navigation={navigation}
      title="Campaigns"
    >
      <section aria-labelledby="campaign-heading">
        <header>
          <p>Partnership operations</p>
          <h2 id="campaign-heading">Campaign workspace</h2>
          <p>
            Track approved client work, deliverables, assets, results and
            financial summaries.
          </p>
        </header>
        <CampaignWorkspace />
      </section>
    </AdminShell>
  );
}
