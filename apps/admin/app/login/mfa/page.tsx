import type { Metadata } from "next";
import { MFAForm } from "@/components/auth/mfa-form";

export const metadata: Metadata = {
  title: "Verify staff access",
  robots: { index: false, follow: false },
};
export default function MFAPage() {
  return <MFAForm />;
}
