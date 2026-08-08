"use client";

import Link from "next/link";
import styles from "./section-switcher.module.css";

const sections = {
  account: [
    { href: "/account", label: "Profile", index: "01" },
    { href: "/account/security", label: "Security", index: "02" },
    { href: "/account/preferences", label: "Preferences", index: "03" },
  ],
  governance: [
    { href: "/analytics", label: "Analytics", index: "01" },
    { href: "/exports", label: "Exports", index: "02" },
    { href: "/audit", label: "Audit", index: "03" },
    { href: "/privacy", label: "Privacy", index: "04" },
  ],
} as const;

export function SectionSwitcher({
  section,
  current,
}: {
  section: keyof typeof sections;
  current: string;
}) {
  return (
    <nav className={styles.switcher} aria-label={`${section} pages`}>
      <span className={styles.label}>{section}</span>
      <ul>
        {sections[section].map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.href === current ? "page" : undefined}
            >
              <span aria-hidden="true">{item.index}</span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
