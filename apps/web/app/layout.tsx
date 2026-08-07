import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Knewave, Outfit } from "next/font/google";
import { getPublicSettings } from "../lib/settings";
import { canonicalURL, jsonLd } from "../lib/seo";
import { Providers } from "../components/providers";

import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const knewave = Knewave({
  subsets: ["latin"],
  variable: "--font-knewave",
  display: "swap",
  weight: "400",
});

const brandIcons: NonNullable<Metadata["icons"]> = {
  icon: [{ url: "/brand/logo.jpeg", type: "image/jpeg" }],
  apple: [{ url: "/brand/logo.jpeg", type: "image/jpeg" }],
};

const fallbackMetadata: Metadata = {
  title: {
    default: "Joe Kuntani",
    template: "%s | Joe Kuntani",
  },
  description: "Official website content is awaiting approval.",
  icons: brandIcons,
};

const themeBootScript = `(function(){try{var t=localStorage.getItem("jk-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme="dark";document.documentElement.style.colorScheme="dark";}})();`;

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
    icons: brandIcons,
  };
}

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0f" },
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
    <html
      lang="en"
      data-theme="dark"
      className={`${outfit.variable} ${knewave.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
