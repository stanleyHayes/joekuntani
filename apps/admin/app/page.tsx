import type { Metadata } from "next";
import Link from "next/link";
import { MetricWatermark } from "../components/metric-watermark";
import { OverviewCharts } from "../components/overview/overview-charts";
import styles from "./overview.module.css";

export const metadata: Metadata = {
  title: "Admin overview",
  robots: { index: false, follow: false },
};

const sections = [
  {
    title: "Publish",
    description:
      "Shape what the public site shows — content, media, services, and global settings.",
    links: [
      { href: "/content", label: "Content" },
      { href: "/media", label: "Media" },
      { href: "/services", label: "Services" },
      { href: "/settings", label: "Settings" },
    ],
  },
  {
    title: "Live & tickets",
    description:
      "Run first-party events from draft through door scan and order review.",
    links: [
      { href: "/events", label: "Events" },
      { href: "/tickets", label: "Tickets & orders" },
      { href: "/checkin", label: "Check-in" },
      { href: "/ticket-analytics", label: "Ticket analytics" },
    ],
  },
  {
    title: "Pipeline",
    description: "Move enquiries into CRM, bookings, and campaign follow-up.",
    links: [
      { href: "/crm", label: "CRM" },
      { href: "/bookings", label: "Bookings" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/newsletter", label: "Newsletter" },
      { href: "/search", label: "Search" },
    ],
  },
  {
    title: "Team & account",
    description:
      "Staff directory, role permissions, and your own profile settings.",
    links: [
      { href: "/team", label: "Users & roles" },
      { href: "/permissions", label: "Permissions" },
      { href: "/account", label: "Profile" },
      { href: "/account/security", label: "Security" },
      { href: "/account/preferences", label: "Preferences" },
    ],
  },
  {
    title: "Governance",
    description:
      "Read the trail — analytics, exports, audit, and privacy holds.",
    links: [
      { href: "/analytics", label: "Analytics" },
      { href: "/exports", label: "Exports" },
      { href: "/audit", label: "Audit" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
] as const;

export default function AdminOverviewPage() {
  return (
    <div className={styles.wrap}>
      <section className={styles.hero} aria-labelledby="admin-welcome">
        <MetricWatermark variant="orbit" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Staff console</p>
          <h2 id="admin-welcome" className={styles.title}>
            Welcome back
          </h2>
          <p className={styles.lede}>
            Pick a lane below. Treat the public site as production-ready only
            after CMS content is complete and published.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.primaryAction} href="/content">
            Open content
          </Link>
          <Link className={styles.secondaryAction} href="/events">
            Open events
          </Link>
        </div>
      </section>

      <OverviewCharts />

      <div className={styles.grid}>
        {sections.map((section) => (
          <section
            key={section.title}
            className={styles.group}
            aria-labelledby={`admin-section-${section.title}`}
          >
            <h3
              id={`admin-section-${section.title}`}
              className={styles.groupTitle}
            >
              {section.title}
            </h3>
            <p className={styles.groupCopy}>{section.description}</p>
            <ul className={styles.links}>
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
