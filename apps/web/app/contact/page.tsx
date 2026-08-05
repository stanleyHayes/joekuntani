import type { Metadata } from "next";
import { ContactForm } from "../../components/public-info/contact-form";
import { getContactConfiguration } from "../../components/public-info/data";
import styles from "../../components/public-info/public-info.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { getPublicServices } from "../../components/services/data";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const [settings, services] = await Promise.all([
    getContactConfiguration(),
    getPublicServices(),
  ]);
  const description =
    "Route a booking, partnership or media enquiry through the official form.";
  return settings && services.length
    ? pageMetadata({ title: "Contact", description, path: "/contact" })
    : unavailableMetadata("Contact", description);
}
export default async function ContactPage() {
  const [settings, services] = await Promise.all([
    getContactConfiguration(),
    getPublicServices(),
  ]);
  return (
    <PublicShell
      currentPath="/contact"
      settings={settings}
      footerCta={{
        href: "/services",
        label: "Review services",
        title: "Choosing an enquiry route?",
        description:
          "Review approved service information before sending a request.",
      }}
    >
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">Contact</p>
            <h1>Route your enquiry.</h1>
          </div>
          <p className={styles.lede}>
            Choose an approved service so your request can be routed
            appropriately. Submission is not a booking confirmation.
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="contact-form"
        >
          <h2 id="contact-form">Send an enquiry</h2>
          <ContactForm services={services} settings={settings} />
        </section>
      </main>
    </PublicShell>
  );
}
