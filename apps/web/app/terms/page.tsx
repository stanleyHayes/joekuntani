import type { Metadata } from "next";
import { getLegalSurface } from "../../components/public-info/data";
import { LegalPage } from "../../components/public-info/legal-page";
import { contentMetadata } from "../../lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { page } = await getLegalSurface("terms");
  return contentMetadata(page, {
    title: "Terms",
    description: "Website terms publication status.",
    path: "/terms",
  });
}
export default async function TermsPage() {
  return <LegalPage kind="terms" {...await getLegalSurface("terms")} />;
}
