import type { Metadata } from "next";
import { Scanner } from "../../components/checkin/scanner";

export const metadata: Metadata = {
  title: "Check-in",
  robots: { index: false, follow: false },
};

export default function AdminCheckinPage() {
  return <Scanner />;
}
