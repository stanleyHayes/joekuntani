import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Knewave, Outfit } from "next/font/google";
import { ThemeProvider } from "@joe-kuntani/shared/theme/theme-provider";
import "@joe-kuntani/shared/styles/globals.css";
import { AdminChrome } from "./admin-chrome";
import { ClearStaleBrowserCache } from "../components/platform/clear-stale-browser-cache";
import "../components/layout/admin-stage.css";

/**
 * Root layout for the standalone console.
 *
 * The dashboard used to be a segment of the public site, so this file did not
 * exist — the public root supplied the fonts, the theme boot and the document
 * shell. On its own origin the console has to bring all of it itself, and the
 * first cut of this file did not: globals.css resolves every family through
 * --font-outfit and --font-knewave, so with those variables undefined the whole
 * console silently fell back to system fonts and the type metrics shifted.
 */
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

/**
 * Applied before first paint so the console never renders light chrome and then
 * snaps to dark. Inline for the same reason — a deferred script paints first.
 */
const themeBootScript = `(function(){try{var t=localStorage.getItem("jk-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme="dark";document.documentElement.style.colorScheme="dark";}})();`;

export const metadata: Metadata = {
  title: { default: "Joe Kuntani admin", template: "%s · Joe Kuntani admin" },
  description: "Staff console for the Joe Kuntani platform.",
  icons: {
    icon: [{ url: "/brand/logo.jpeg", type: "image/jpeg" }],
    apple: [{ url: "/brand/logo.jpeg", type: "image/jpeg" }],
  },
  // The console must never be indexed, on any route.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
        <ClearStaleBrowserCache />
        <ThemeProvider>
          <AdminChrome>{children}</AdminChrome>
        </ThemeProvider>
      </body>
    </html>
  );
}
