import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getPublicSettings } from "../lib/settings";
import { canonicalURL, jsonLd } from "../lib/seo";

import "./globals.css";

const fallbackMetadata: Metadata = {
  title: {
    default: "Joe Kuntani",
    template: "%s | Joe Kuntani",
  },
  description: "Official website content is awaiting approval.",
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  if (!settings) return fallbackMetadata;
  return {
    title: {
      default: settings.seo.default_title || settings.brand.name,
      template: settings.seo.title_template || `%s | ${settings.brand.name}`,
    },
    description: settings.seo.description || undefined,
    metadataBase: settings.seo.canonical_base
      ? new URL(settings.seo.canonical_base)
      : undefined,
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#171916" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const settings = await getPublicSettings();
  const website = canonicalURL("/", settings?.seo.canonical_base);
  return (
    <html lang="en">
      <body>
        {website && settings?.brand.name ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLd({
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: settings.brand.name,
                url: website,
              }),
            }}
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
