import Link from "next/link";

import {
  NewsletterForm,
  type NewsletterConsent,
} from "../newsletter/newsletter-form";
import { SupportButton } from "../support/support-button";
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
  social?: readonly { platform: string; url: string }[];
  statusText?: string;
  /** Consent copy from site settings; without it the signup does not render. */
  newsletterConsent?: NewsletterConsent;
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
  social = [],
  statusText,
  newsletterConsent,
}: PublicFooterProps) {
  // Only approved profiles with a usable address are shown; the API already
  // rejects anything that is not absolute HTTPS.
  const profiles = social.filter((item) => item.platform && item.url);
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
      <section className="footer-support shell-container">
        <div>
          <p className="footer-support__eyebrow">Support the artist</p>
          <p className="footer-support__copy">
            Not booking today? A one-off contribution keeps the rehearsals, gear
            and road time going.
          </p>
        </div>
        <SupportButton variant="ghost" />
      </section>
      {newsletterConsent ? (
        <section
          className="footer-newsletter shell-container"
          aria-labelledby="footer-newsletter"
        >
          <div>
            <p className="footer-newsletter__eyebrow" id="footer-newsletter">
              Newsletter
            </p>
            <p className="footer-newsletter__copy">
              Dates, releases and the occasional story from the road.
            </p>
          </div>
          <NewsletterForm consent={newsletterConsent} source="footer" />
        </section>
      ) : null}
      {profiles.length ? (
        <section
          className="footer-social shell-container"
          aria-labelledby="footer-follow"
        >
          <p className="footer-social__eyebrow" id="footer-follow">
            Follow
          </p>
          <ul className="footer-social__list">
            {profiles.map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.platform}
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="footer-meta shell-container">
        <Link
          className="wordmark"
          href="/"
          aria-label={`${brandName || "Joe Kuntani"} home`}
        >
          <BrandMark brandName={brandName || "Joe Kuntani"} size="sm" />
        </Link>
        <nav className="footer-legal" aria-label="Footer navigation">
          {links.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="footer-status">
          <span>
            © {new Date().getFullYear()} {brandName || "Joe Kuntani"}
          </span>
          <span aria-hidden="true">·</span>
          <span>{statusText || "Official content awaiting approval."}</span>
        </p>
      </div>
    </footer>
  );
}

export type { FooterCta };
