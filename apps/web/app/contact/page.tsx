import type { Metadata } from "next";
import { ContactDetails } from "../../components/public-info/contact-details";
import { ContactForm } from "../../components/public-info/contact-form";
import { getContactConfiguration } from "../../components/public-info/data";
import styles from "../../components/public-info/public-info.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { getPublicServices } from "../../components/services/data";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";
import { getPublicSettings } from "../../lib/settings";

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
  // `getContactConfiguration` gates on consent copy because the enquiry form
  // cannot submit without it. The published contact details are not gated that
  // way — a visitor should still get an email address when consent is pending.
  const [settings, publishedSettings, services] = await Promise.all([
    getContactConfiguration(),
    getPublicSettings(),
    getPublicServices(),
  ]);
  return (
    <PublicShell
      currentPath="/contact"
      settings={settings ?? publishedSettings}
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
          <div className={styles.contactLayout}>
            <div className={styles.contactMain}>
              <h2 id="contact-form">Send an enquiry</h2>
              <ContactForm services={services} settings={settings} />
            </div>
            <ContactDetails settings={publishedSettings} />
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
