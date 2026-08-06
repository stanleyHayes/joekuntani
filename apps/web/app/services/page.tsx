import { PublicShell } from "../../components/layout/public-shell";
import { getPublicServices } from "../../components/services/data";
import styles from "../../components/services/services.module.css";
import { ButtonLink } from "../../components/ui/button-link";
import { DemoBanner } from "../../components/ui/demo-banner";
import { EmptyState } from "../../components/ui/empty-state";
import { demoContentEnabled, demoServices } from "../../lib/demo/content";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

export async function generateMetadata() {
  const services = await getPublicServices();
  const demo = demoContentEnabled();
  const input = {
    title: "Services",
    description: "Approved services and enquiry paths.",
    path: "/services",
  };
  return services.length || demo
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const published = await getPublicServices();
  const demo = demoContentEnabled();
  const services = published.length ? published : demo ? demoServices : [];
  const usingDemo = demo && !published.length;
  return (
    <PublicShell
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
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">{usingDemo ? "Demo services" : "Services"}</p>
            <h1>Choose the right starting point.</h1>
            <p>
              {usingDemo
                ? "These demo services exist only for layout and enquiry-flow review. Replace them with approved services in admin."
                : "This page lists only service descriptions approved through the content system. Each option opens a contextual enquiry path."}
            </p>
          </div>
          <p className={styles.heroAside}>
            Scope, availability and commercial terms are confirmed after the
            team reviews a complete brief.
          </p>
        </header>

        <section
          className={`${styles.footerSpace} shell-container`}
          aria-labelledby="services-heading"
        >
          <h2 className={styles.sectionTitle} id="services-heading">
            Available services
          </h2>
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
              {services.map((service) => (
                <li className={styles.card} key={service.id}>
                  <p className={styles.category}>{service.category}</p>
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
      </main>
    </PublicShell>
  );
}
