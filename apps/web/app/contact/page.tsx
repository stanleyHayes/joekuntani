import type { Metadata } from "next";
import { ContactDetails } from "../../components/public-info/contact-details";
import { ContactForm } from "../../components/public-info/contact-form";
import { getContactConfiguration } from "../../components/public-info/data";
import styles from "../../components/public-info/public-info.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { getPublicServices } from "../../components/services/data";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";
import { getPublicSettings } from "../../lib/settings";
import { PublicInfoNav } from "../../components/public-info/public-info-nav";

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
        <header
          className={`${styles.hero} ${styles.contactHero} shell-container`}
        >
          <div className={styles.heroTitle}>
            <p className="eyebrow">Start a conversation</p>
            <h1>Bring us the brief.</h1>
            <span className={styles.heroCode} aria-hidden="true">
              C/02
            </span>
          </div>
          <p className={styles.lede}>
            Dates, rooms, ideas, partnerships. Give the team enough context to
            put your enquiry in the right hands.
          </p>
        </header>
        <div className="shell-container">
          <PublicInfoNav currentPath="/contact" />
        </div>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="contact-form"
        >
          <div className={styles.contactLayout}>
            <div className={styles.contactMain}>
              <div className={styles.sectionIntro}>
                <p className={styles.sectionIndex}>Enquiry desk / 02</p>
                <h2 id="contact-form">Tell us what you&apos;re planning.</h2>
                <p>
                  Choose the closest route and share the useful details.
                  Submission starts a conversation; it does not confirm a
                  booking.
                </p>
              </div>
              <ContactForm services={services} settings={settings} />
            </div>
            <ContactDetails settings={publishedSettings} />
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
