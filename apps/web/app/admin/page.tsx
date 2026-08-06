import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "../../components/layout/admin-shell";
import styles from "./overview.module.css";

export const metadata: Metadata = {
  title: "Admin overview",
  robots: { index: false, follow: false },
};

const navigation = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/crm", label: "CRM" },
  { href: "/admin/tickets", label: "Tickets & Orders" },
  { href: "/admin/settings", label: "Global settings" },
] as const;

const sections = [
  {
    title: "Publish",
    description: "Homepage, portfolio, press, and media for the public site.",
    links: [
      { href: "/admin/content", label: "Content" },
      { href: "/admin/media", label: "Media" },
      { href: "/admin/services", label: "Services" },
      { href: "/admin/settings", label: "Global settings" },
    ],
  },
  {
    title: "Live & tickets",
    description: "First-party events, orders, check-in, and ticket analytics.",
    links: [
      { href: "/admin/events", label: "Events" },
      { href: "/admin/tickets", label: "Tickets & Orders" },
      { href: "/admin/checkin", label: "Check-in" },
      { href: "/admin/ticket-analytics", label: "Ticket analytics" },
    ],
  },
  {
    title: "Pipeline",
    description: "Enquiries, CRM workflow, bookings, and campaigns.",
    links: [
      { href: "/admin/crm", label: "CRM" },
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/campaigns", label: "Campaigns" },
      { href: "/admin/search", label: "Search" },
    ],
  },
  {
    title: "Governance",
    description: "Analytics, exports, audit trail, and privacy holds.",
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
    <AdminShell
      currentPath="/admin"
      navigation={navigation}
      title="Overview"
    >
      <div className={styles.wrap}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Staff console</p>
          <h2 className={styles.title}>Welcome back</h2>
          <p className={styles.lede}>
            Choose a workspace below. Content and events should be published
            through CMS before treating the public site as production-ready.
          </p>
        </header>
        <div className={styles.grid}>
          {sections.map((section) => (
            <section
              key={section.title}
              className={styles.card}
              aria-labelledby={`admin-section-${section.title}`}
            >
              <h3 id={`admin-section-${section.title}`} className={styles.cardTitle}>
                {section.title}
              </h3>
              <p className={styles.cardCopy}>{section.description}</p>
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
    </AdminShell>
  );
}
