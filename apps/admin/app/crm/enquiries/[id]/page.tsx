import type { Metadata } from "next";
import { EnquiryDetail } from "../../../../components/crm/enquiry-detail";

export const metadata: Metadata = {
  title: "Enquiry",
  robots: { index: false, follow: false },
};

export default async function AdminCRMEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnquiryDetail enquiryID={id} />;
}
