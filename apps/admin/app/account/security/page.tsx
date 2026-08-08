import type { Metadata } from "next";
import { SecurityWorkspace } from "@/components/account/account-workspace";

export const metadata: Metadata = {
  title: "Security",
  robots: { index: false, follow: false },
};

export default function AdminSecurityPage() {
  return <SecurityWorkspace />;
}
