import { BookingForm } from "../../components/enquiries/booking-form";
import { getPublicSettings } from "../../lib/settings";
import { PublicShell } from "../../components/layout/public-shell";
import { getPublicServices } from "../../components/services/data";
import { DemoBanner } from "../../components/ui/demo-banner";
import { demoContentEnabled, demoServices } from "../../lib/demo/content";
import styles from "./book.module.css";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const shellSettings = await getPublicSettings();
  const [{ service }, published] = await Promise.all([
    searchParams,
    getPublicServices(),
  ]);
  const demo = demoContentEnabled();
  const services = published.length ? published : demo ? demoServices : [];
  const usingDemo = demo && !published.length;
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/book"
      footerCta={{
        href: "/services",
        label: "Review services",
        title: "Need a different route?",
        description:
          "Review approved service information before completing an enquiry.",
      }}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={styles.page}>
        <header className={`${styles.hero} shell-container`}>
          <p className={styles.kicker}>Booking desk / Accra</p>
          <div className={styles.heroGrid}>
            <h1>
              Bring Joe
              <br />
              <span>into the room.</span>
            </h1>
            <div>
              <p>
                Share the shape of the event, campaign or partnership. The team
                reviews every brief before confirming scope or availability.
              </p>
              <dl>
                <div>
                  <dt>Response</dt>
                  <dd>Reviewed by the booking team</dd>
                </div>
                <div>
                  <dt>Commitment</dt>
                  <dd>No booking until terms are agreed</dd>
                </div>
              </dl>
            </div>
          </div>
        </header>
        <div className={`${styles.formStage} shell-container`}>
          <BookingForm initialSlug={service ?? ""} services={services} />
        </div>
      </main>
    </PublicShell>
  );
}
