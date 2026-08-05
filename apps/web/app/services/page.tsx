import { PublicShell } from "../../components/layout/public-shell";
import { getPublicServices } from "../../components/services/data";
import styles from "../../components/services/services.module.css";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

export async function generateMetadata() {
  const services = await getPublicServices();
  const input = {
    title: "Services",
    description: "Approved services and enquiry paths.",
    path: "/services",
  };
  return services.length
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
}
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const services = await getPublicServices();
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
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <div>
            <p className="eyebrow">Services</p>
            <h1>Choose the right starting point.</h1>
            <p>
              This page lists only service descriptions approved through the
              content system. Each option opens a contextual enquiry path.
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
            <div className={styles.empty} role="status">
              <h2>Service details are awaiting approval.</h2>
              <p>
                Nothing has been published yet. Please use the general enquiry
                route if you would like to contact the booking team.
              </p>
              <a className={styles.cta} href="/book">
                Make a general enquiry
              </a>
            </div>
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
