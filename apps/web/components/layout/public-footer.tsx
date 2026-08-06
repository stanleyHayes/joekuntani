import Link from "next/link";

import { ButtonLink } from "../ui/button-link";
import { BrandMark } from "./brand-mark";

type FooterCta = {
  description: string;
  href: string;
  label: string;
  title: string;
};

type PublicFooterProps = {
  cta: FooterCta;
  brandName?: string;
  links?: readonly { href: string; label: string }[];
  statusText?: string;
};

const fallbackLinks = [
  { href: "/media-kit", label: "Media kit" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export function PublicFooter({
  cta,
  brandName,
  links = fallbackLinks,
  statusText,
}: PublicFooterProps) {
  return (
    <footer className="site-footer">
      <section
        className="footer-cta shell-container"
        aria-labelledby="footer-cta-title"
      >
        <div>
          <h2 id="footer-cta-title">{cta.title}</h2>
          <p>{cta.description}</p>
        </div>
        <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
      </section>
      <div className="footer-meta shell-container">
        <Link
          className="wordmark"
          href="/"
          aria-label={`${brandName || "Joe Kuntani"} home`}
        >
          <BrandMark brandName={brandName || "Joe Kuntani"} size="sm" />
        </Link>
        <nav aria-label="Footer navigation">
          {links.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p>{statusText || "Official content awaiting approval."}</p>
      </div>
    </footer>
  );
}

export type { FooterCta };
