import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const metadata: Metadata = {
  title: "Activate your staff account",
  robots: { index: false, follow: false },
};

export default function AcceptInvitePage() {
  // The form reads the token from the query string, so it has to be able to
  // suspend while the client router resolves the search params.
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
