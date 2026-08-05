import Link from "next/link";

import { ButtonLink } from "../ui/button-link";

const fallbackNavigation = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/work", label: "Work" },
  { href: "/services", label: "Services" },
  { href: "/videos", label: "Videos" },
  { href: "/press", label: "Press" },
  { href: "/events", label: "Events" },
] as const;

type PublicHeaderProps = {
  currentPath?: string;
  navigation?: readonly { href: string; label: string }[];
  brandName?: string;
  cta?: { href: string; label: string };
};

function NavigationLinks({
  currentPath,
  navigation = fallbackNavigation,
}: PublicHeaderProps) {
  return (
    <ul>
      {navigation.map((item) => (
        <li key={item.href}>
          <Link
            aria-current={currentPath === item.href ? "page" : undefined}
            href={item.href}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PublicHeader({
  currentPath,
  navigation,
  brandName,
  cta,
}: PublicHeaderProps) {
  const safeBrandName = brandName || "Joe Kuntani";
  const safeCTA = cta || { href: "/book", label: "Make an enquiry" };
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="site-header__inner shell-container">
        <Link className="wordmark" href="/" aria-label="Joe Kuntani home">
          {safeBrandName}
        </Link>
        <nav className="desktop-navigation" aria-label="Primary navigation">
          <NavigationLinks currentPath={currentPath} navigation={navigation} />
        </nav>
        <ButtonLink className="header-cta" href={safeCTA.href}>
          {safeCTA.label}
        </ButtonLink>
        <details className="mobile-navigation">
          <summary>Menu</summary>
          <nav aria-label="Mobile navigation">
            <NavigationLinks
              currentPath={currentPath}
              navigation={navigation}
            />
            <ButtonLink href={safeCTA.href}>{safeCTA.label}</ButtonLink>
          </nav>
        </details>
      </div>
    </header>
  );
}
