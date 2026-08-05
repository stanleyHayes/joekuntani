import type { ReactNode } from "react";
import { canonicalURL, jsonLd, pageMetadata } from "../../lib/seo";
import { getPublicSettings } from "../../lib/settings";

const description =
  "Submit a booking or partnership enquiry for review by the official team.";

export const generateMetadata = () =>
  pageMetadata({ title: "Booking enquiry", description, path: "/book" });

export default async function BookLayout({
  children,
}: {
  children: ReactNode;
}) {
  const settings = await getPublicSettings();
  const url = canonicalURL("/book", settings?.seo.canonical_base);
  return (
    <>
      {url ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: "Booking enquiry",
              description,
              url,
            }),
          }}
        />
      ) : null}
      {children}
    </>
  );
}
