import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentEditor } from "../../../../../components/admin/content/content-editor";
import { isContentKind } from "../../../../../components/admin/content/content-api";

export const metadata: Metadata = {
  title: "Content",
  robots: { index: false, follow: false },
};

export default async function AdminContentEditorPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  // The segment is user-typed, and an unknown kind would otherwise be sent to
  // the API as a collection name.
  if (!isContentKind(kind)) notFound();
  return <ContentEditor kind={kind} contentID={id} />;
}
