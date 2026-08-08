"use client";

import Link from "next/link";
import styles from "./section-switcher.module.css";

const sections = {
  account: [
    { href: "/admin/account", label: "Profile", index: "01" },
    { href: "/admin/account/security", label: "Security", index: "02" },
    { href: "/admin/account/preferences", label: "Preferences", index: "03" },
  ],
  governance: [
    { href: "/admin/analytics", label: "Analytics", index: "01" },
    { href: "/admin/exports", label: "Exports", index: "02" },
    { href: "/admin/audit", label: "Audit", index: "03" },
    { href: "/admin/privacy", label: "Privacy", index: "04" },
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
