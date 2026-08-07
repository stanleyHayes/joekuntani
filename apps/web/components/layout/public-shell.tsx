import type { ReactNode } from "react";

import { MotionShell } from "../motion/scroll-reveal";
import { ThemeProvider } from "../theme/theme-provider";
import { BrandWatermark } from "../ui/brand-watermark";
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
  const globalCTA = settings?.ctas.find((item) => item.key === "global");
  const effectiveCTA = globalCTA || footerCta;
  return (
    <ThemeProvider>
      <div className="public-shell">
        <PublicHeader
          currentPath={currentPath}
          navigation={settings?.navigation}
          brandName={settings?.brand.name}
          cta={settings?.ctas.find((item) => item.key === "header")}
        />
        <div className="public-shell__stage">
          {showWatermark ? <BrandWatermark /> : null}
          <MotionShell>{children}</MotionShell>
        </div>
        <PublicFooter
          cta={effectiveCTA}
          links={settings?.footer}
          social={settings?.social}
          brandName={settings?.brand.name}
          statusText={settings ? settings.brand.tagline : undefined}
        />
      </div>
    </ThemeProvider>
  );
}
