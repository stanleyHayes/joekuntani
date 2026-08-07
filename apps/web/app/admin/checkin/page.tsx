import type { Metadata } from "next";
import { Scanner } from "../../../components/admin/checkin/scanner";

export const metadata: Metadata = {
  title: "Check-in",
  robots: { index: false, follow: false },
};

export default function AdminCheckinPage() {
  return <Scanner />;
}
