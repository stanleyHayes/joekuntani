import type { Metadata } from "next";

import { ServiceEditor } from "../../../components/services/service-editor";

export const metadata: Metadata = {
  title: "Service",
  robots: { index: false, follow: false },
};

export default async function AdminServiceEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ServiceEditor serviceID={id} />;
}
