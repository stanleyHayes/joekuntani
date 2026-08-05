import type { ReactNode } from "react";

import { PublicFooter, type FooterCta } from "./public-footer";
import { PublicHeader } from "./public-header";
import type { PublicSettings } from "../../lib/settings";

type PublicShellProps = {
  children: ReactNode;
  currentPath?: string;
  footerCta: FooterCta;
  settings?: PublicSettings | null;
};

export function PublicShell({
  children,
  currentPath,
  footerCta,
  settings,
}: PublicShellProps) {
  const globalCTA = settings?.ctas.find((item) => item.key === "global");
  const effectiveCTA = globalCTA || footerCta;
  return (
    <div className="public-shell">
      <PublicHeader
        currentPath={currentPath}
        navigation={settings?.navigation}
        brandName={settings?.brand.name}
        cta={settings?.ctas.find((item) => item.key === "header")}
      />
      {children}
      <PublicFooter
        cta={effectiveCTA}
        links={settings?.footer}
        brandName={settings?.brand.name}
        statusText={settings ? settings.brand.tagline : undefined}
      />
    </div>
  );
}
