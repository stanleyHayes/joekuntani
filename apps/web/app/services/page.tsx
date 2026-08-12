import { PublicShell } from "../../components/layout/public-shell";
import { getPublicSettings } from "../../lib/settings";
import { getPublicServices } from "../../components/services/data";
import styles from "../../components/services/services.module.css";
import { ButtonLink } from "../../components/ui/button-link";
import { DemoBanner } from "../../components/ui/demo-banner";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { demoContentEnabled, demoServices } from "../../lib/demo/content";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

export async function generateMetadata() {
  const services = await getPublicServices();
  const demo = demoContentEnabled();
  const input = {
    title: "Services",
    description: "Approved services and enquiry paths.",
    path: "/services",
    keywords: ["comedy services", "corporate host", "MC for hire", "wedding comedian", "brand collaboration comedy"],
  };
  return services.length || demo
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const shellSettings = await getPublicSettings();
  const published = await getPublicServices();
  const demo = demoContentEnabled();
  const services = published.length ? published : demo ? demoServices : [];
  const usingDemo = demo && !published.length;
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/services"
      footerCta={{
        href: "/book",
        label: "Make an enquiry",
        title: "Have a specific brief in mind?",
        description:
          "Use the enquiry form to share the project context with the booking team.",
      }}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={styles.page}>
        <header className={`${styles.hero} shell-container`}>
          <p className={styles.kicker}>Services</p>
          <div className={styles.heroGrid}>
            <h1>Ways to work together.</h1>
            <div className={styles.heroCopy}>
              <p>
                {usingDemo
                  ? "Demo services for layout and enquiry-flow review. Replace them with approved offers in admin."
                  : "Choose the closest starting point. Every enquiry is reviewed before scope, availability and commercial terms are confirmed."}
              </p>
              <a href="#services-heading">
                Explore services <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </header>

        <section
          className={`${styles.footerSpace} shell-container`}
          aria-labelledby="services-heading"
        >
          <div className={styles.sectionHead}>
            <span>01</span>
            <h2 id="services-heading">Available services</h2>
            <p>
              Each route opens an enquiry with the relevant service already
              selected.
            </p>
          </div>
          {services.length === 0 ? (
            <EmptyState
              className={styles.empty}
              tone="inbox"
              title="Services are still being cleared"
              description="Nothing approved has published yet. Send a general enquiry if you need the booking team in the meantime."
              action={
                <ButtonLink href="/book" variant="primary">
                  Make a general enquiry
                </ButtonLink>
              }
            />
          ) : (
            <ol className={styles.list}>
              {services.map((service, index) => (
                <li className={styles.card} key={service.id}>
                  <div className={styles.cardTop}>
                    <p className={styles.category}>{service.category}</p>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h2>{service.name}</h2>
                  <p className={styles.summary}>{service.summary}</p>
                  <a
                    className={styles.cta}
                    href={`/book?service=${encodeURIComponent(service.slug)}`}
                  >
                    {service.cta.label}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section
          className={`${styles.process} shell-container`}
          aria-labelledby="service-process"
        >
          <div className={styles.sectionHead}>
            <span>02</span>
            <h2 id="service-process">From brief to booking</h2>
          </div>
          <ol>
            <li>
              <span>01</span>
              <h3>Share the context</h3>
              <p>Send the date, location, audience and the outcome you want.</p>
            </li>
            <li>
              <span>02</span>
              <h3>Align the scope</h3>
              <p>
                The team reviews fit, availability and the practical
                requirements.
              </p>
            </li>
            <li>
              <span>03</span>
              <h3>Confirm the booking</h3>
              <p>
                Agreed details move into the formal booking and production
                process.
              </p>
            </li>
          </ol>
        </section>
      </main>
    </PublicShell>
  );
}
