import type { Metadata } from "next";
import { NewsletterWorkspace } from "../../components/newsletter/newsletter-workspace";

export const metadata: Metadata = {
  title: "Newsletter",
  robots: { index: false, follow: false },
};

export default function AdminNewsletterPage() {
  return <NewsletterWorkspace />;
}
