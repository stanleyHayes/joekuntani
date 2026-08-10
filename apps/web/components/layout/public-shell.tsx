import type { ReactNode } from "react";

import { MotionShell } from "../motion/scroll-reveal";
import { ThemeProvider } from "../theme/theme-provider";
import { BrandWatermark } from "../ui/brand-watermark";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { PublicFooter, type FooterCta } from "./public-footer";
import { PublicHeader } from "./public-header";
import type { PublicSettings } from "../../lib/settings";

type PublicShellProps = {
  children: ReactNode;
  currentPath?: string;
  footerCta: FooterCta;
  settings?: PublicSettings | null;
  showWatermark?: boolean;
};

export function PublicShell({
  children,
  currentPath,
  footerCta,
  settings,
  showWatermark = true,
}: PublicShellProps) {
  // Pages must fetch and pass published settings. Resolving them here instead
  // would make the shell async, and an async shell cannot be rendered by the
  // synchronous test harness — see public-settings.test.tsx, which fails the
  // build if a public page forgets to pass them.
  const resolved = settings;
  const globalCTA = resolved?.ctas?.find((item) => item.key === "global");
  const effectiveCTA = globalCTA || footerCta;
  return (
    <ThemeProvider>
      <div className="public-shell">
        <PublicHeader
          currentPath={currentPath}
          navigation={resolved?.navigation}
          brandName={resolved?.brand?.name}
          cta={resolved?.ctas?.find((item) => item.key === "header")}
        />
        <div className="public-shell__stage">
          {showWatermark ? <BrandWatermark /> : null}
          <MotionShell>{children}</MotionShell>
        </div>
        <PublicFooter
          cta={effectiveCTA}
          links={resolved?.footer}
          social={resolved?.social}
          brandName={resolved?.brand?.name}
          statusText={resolved?.brand?.tagline}
          // Consent copy is published from settings, so the signup carries the
          // wording that was actually on screen when someone agreed.
          newsletterConsent={
            resolved?.consent?.version
              ? {
                  version: resolved.consent.version,
                  marketingLabel: resolved.consent.marketing_label,
                  privacyURL: resolved.consent.privacy_url,
                }
              : undefined
          }
        />
        <MobileBottomNav
          currentPath={currentPath}
          navigation={resolved?.navigation}
          cta={resolved?.ctas?.find((item) => item.key === "header")}
        />
      </div>
    </ThemeProvider>
  );
}
