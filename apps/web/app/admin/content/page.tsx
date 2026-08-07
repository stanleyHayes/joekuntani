import type { Metadata } from "next";
import { CMSWorkspace } from "../../../components/admin/content/cms-workspace";

export const metadata: Metadata = {
  title: "Content",
  robots: { index: false, follow: false },
};
export default function AdminContentPage() {
  return <CMSWorkspace />;
}
