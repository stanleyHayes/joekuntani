import type { Metadata } from "next";
import Link from "next/link";
import { MetricWatermark } from "../../components/admin/metric-watermark";
import { OverviewCharts } from "../../components/admin/overview/overview-charts";
import styles from "./overview.module.css";

export const metadata: Metadata = {
  title: "Admin overview",
  robots: { index: false, follow: false },
};

const lanes = [
  {
    label: "Publish",
    value: "CMS",
    sub: "Homepage, work, press, media",
    href: "/admin/content",
    tone: "j" as const,
  },
  {
    label: "Live",
    value: "Events",
    sub: "Showtimes, holds, check-in",
    href: "/admin/events",
    tone: "k" as const,
  },
  {
    label: "Pipeline",
    value: "CRM",
    sub: "Enquiries and bookings",
    href: "/admin/crm",
    tone: "j" as const,
  },
  {
    label: "Govern",
    value: "Audit",
    sub: "Exports, privacy, trail",
    href: "/admin/audit",
    tone: "k" as const,
  },
] as const;
const watermarkVariants = ["grid", "orbit", "wave", "spark"] as const;

const sections = [
  {
    title: "Publish",
    description:
      "Shape what the public site shows — content, media, services, and global settings.",
    links: [
      { href: "/admin/content", label: "Content" },
      { href: "/admin/media", label: "Media" },
      { href: "/admin/services", label: "Services" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
  {
    title: "Live & tickets",
    description:
      "Run first-party events from draft through door scan and order review.",
    links: [
      { href: "/admin/events", label: "Events" },
      { href: "/admin/tickets", label: "Tickets & orders" },
      { href: "/admin/checkin", label: "Check-in" },
      { href: "/admin/ticket-analytics", label: "Ticket analytics" },
    ],
  },
  {
    title: "Pipeline",
    description: "Move enquiries into CRM, bookings, and campaign follow-up.",
    links: [
      { href: "/admin/crm", label: "CRM" },
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/campaigns", label: "Campaigns" },
      { href: "/admin/newsletter", label: "Newsletter" },
      { href: "/admin/search", label: "Search" },
    ],
  },
  {
    title: "Team & account",
    description:
      "Staff directory, role permissions, and your own profile settings.",
    links: [
      { href: "/admin/team", label: "Users & roles" },
      { href: "/admin/permissions", label: "Permissions" },
      { href: "/admin/account", label: "Profile" },
      { href: "/admin/account/security", label: "Security" },
      { href: "/admin/account/preferences", label: "Preferences" },
    ],
  },
  {
    title: "Governance",
    description:
      "Read the trail — analytics, exports, audit, and privacy holds.",
    links: [
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/exports", label: "Exports" },
      { href: "/admin/audit", label: "Audit" },
      { href: "/admin/privacy", label: "Privacy" },
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
          <Link className={styles.primaryAction} href="/admin/content">
            Open content
          </Link>
          <Link className={styles.secondaryAction} href="/admin/events">
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
