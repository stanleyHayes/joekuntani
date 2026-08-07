import type { Metadata } from "next";
import { MerchWorkspace } from "../../../components/admin/merch/merch-workspace";

export const metadata: Metadata = {
  title: "Merchandise",
  robots: { index: false, follow: false },
};

export default function AdminMerchPage() {
  return <MerchWorkspace />;
}
