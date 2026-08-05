import type { Metadata } from "next";
import { getLegalSurface } from "../../components/public-info/data";
import { LegalPage } from "../../components/public-info/legal-page";
import { contentMetadata } from "../../lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { page } = await getLegalSurface("privacy");
  return contentMetadata(page, {
    title: "Privacy",
    description: "Privacy publication status.",
    path: "/privacy",
  });
}
export default async function PrivacyPage() {
  return <LegalPage kind="privacy" {...await getLegalSurface("privacy")} />;
}
