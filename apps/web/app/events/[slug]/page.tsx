import type { Metadata } from "next";
import { getPublicEvent } from "../../../components/events/data";
import {
  formatDateRange,
  TicketCard,
} from "../../../components/events/event-ui";
import styles from "../../../components/events/events.module.css";
import { PublicShell } from "../../../components/layout/public-shell";
import { DemoBanner } from "../../../components/ui/demo-banner";
import {
  demoContentEnabled,
  demoEventCovers,
  demoEvents,
} from "../../../lib/demo/content";
import {
  canonicalURL,
  jsonLd,
  pageMetadata,
  unavailableMetadata,
} from "../../../lib/seo";
import { getPublicSettings } from "../../../lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicEvent(slug);
  const demoEvent =
    demoContentEnabled() && !result.data
      ? demoEvents.find((item) => item.slug === slug)
      : null;
  const event = result.data ?? demoEvent ?? null;
  if (!event)
    return unavailableMetadata(
      "Event unavailable",
      "Published event information is unavailable.",
    );
  return pageMetadata({
    title: event.title,
    description: event.summary,
    path: `/events/${slug}`,
    socialImageAssetID: event.banner_asset_id,
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result, settings] = await Promise.all([
    getPublicEvent(slug),
    getPublicSettings(),
  ]);
  const demo = demoContentEnabled();
  const demoEvent =
    demo && !result.data
      ? demoEvents.find((item) => item.slug === slug)
      : null;
  const usingDemo = Boolean(demoEvent);
  const event = result.data ?? demoEvent ?? null;
  const url = canonicalURL(`/events/${slug}`, settings?.seo.canonical_base);
  const cover = usingDemo && event ? demoEventCovers[event.slug] : undefined;
  return (
    <PublicShell
      currentPath="/events"
      footerCta={{
        href: "/events",
        label: "Browse events",
        title: "Looking for another date?",
        description: "Return to all published upcoming and past events.",
      }}
    >
      {usingDemo ? <DemoBanner /> : null}
      {event && url && !usingDemo ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@context": "https://schema.org",
              "@type": "Event",
              name: event.title,
              description: event.summary,
              startDate: event.starts_at,
              endDate: event.ends_at,
              eventStatus: "https://schema.org/EventScheduled",
              eventAttendanceMode:
                "https://schema.org/OfflineEventAttendanceMode",
              url,
              location: {
                "@type": "Place",
                name: event.venue.name,
                address: {
                  "@type": "PostalAddress",
                  streetAddress: event.venue.address,
                  addressLocality: event.venue.city,
                  addressCountry: event.venue.country_code,
                },
              },
              offers: event.tickets.map((ticket) => ({
                "@type": "Offer",
                name: ticket.name,
                price: ticket.price,
                priceCurrency: ticket.currency,
                url: ticket.checkout_href
                  ? canonicalURL(
                      ticket.checkout_href,
                      settings?.seo.canonical_base,
                    )
                  : url,
                availability: schemaAvailability(ticket.availability),
                validFrom: ticket.sales_start,
              })),
            }),
          }}
        />
      ) : null}
      <main id="main-content">
        {!event ? (
          <section className={`${styles.hero} shell-container`}>
            <p className="eyebrow">Event status</p>
            <h1>Event unavailable</h1>
            <p
              className={styles.notice}
              role={result.state === "error" ? "alert" : "status"}
            >
              {result.state === "error"
                ? "Published event information could not be loaded."
                : "This event is not published or does not exist."}
            </p>
          </section>
        ) : (
          <>
            <header className={`${styles.hero} shell-container`}>
              <p className="eyebrow">
                {usingDemo ? "Demo event" : "Published event"}
              </p>
              <h1>{event.title}</h1>
              <p className={styles.lede}>{event.summary}</p>
              <p>{formatDateRange(event)}</p>
              {cover ? (
                <figure className={styles.detailMedia}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover} alt="" width={1600} height={900} />
                  <figcaption>Demo media — replace via CMS</figcaption>
                </figure>
              ) : null}
              <a className={styles.primary} href="#tickets">
                Review ticket availability
              </a>
            </header>
            <section
              className={`${styles.section} shell-container`}
              aria-labelledby="event-details"
            >
              <div className={styles.sectionHead}>
                <span>01</span>
                <h2 id="event-details">Event details</h2>
                <p>Where this date happens, and when doors run.</p>
              </div>
              <div className={styles.detailBody}>
                <p className={styles.detailProse}>{event.description}</p>
                <div className={styles.factPanel}>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Venue</dt>
                      <dd>{event.venue.name}</dd>
                    </div>
                    <div>
                      <dt>Address</dt>
                      <dd>
                        {event.venue.address}, {event.venue.city},{" "}
                        {event.venue.country_code}
                      </dd>
                    </div>
                    <div>
                      <dt>Local date and time</dt>
                      <dd>{formatDateRange(event)}</dd>
                    </div>
                    <div>
                      <dt>Timezone</dt>
                      <dd>{event.timezone}</dd>
                    </div>
                  </dl>
                  {event.venue.map_url ? (
                    <a
                      className={styles.mapLink}
                      href={event.venue.map_url}
                      rel="noopener noreferrer"
                    >
                      Open approved venue map
                    </a>
                  ) : null}
                  {event.venue.accessibility ? (
                    <div className={styles.accessNote}>
                      <h3>Venue accessibility</h3>
                      <p>{event.venue.accessibility}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
            <section
              className={`${styles.section} shell-container`}
              aria-labelledby="event-policies"
            >
              <div className={styles.sectionHead}>
                <span>02</span>
                <h2 id="event-policies">Entry and event policies</h2>
                <p>Door rules, refunds and age guidance for this date.</p>
              </div>
              <div className={styles.policyGrid}>
                <article className={styles.policy}>
                  <h3>Entry</h3>
                  <p>{event.policies.entry}</p>
                </article>
                <article className={styles.policy}>
                  <h3>Refunds</h3>
                  <p>{event.policies.refunds}</p>
                </article>
                <article className={styles.policy}>
                  <h3>Age guidance</h3>
                  <p>
                    {event.policies.age_guidance ||
                      `Minimum age: ${event.policies.age_limit}`}
                  </p>
                </article>
                {event.policies.accessibility ? (
                  <article className={styles.policy}>
                    <h3>Accessibility</h3>
                    <p>{event.policies.accessibility}</p>
                  </article>
                ) : null}
              </div>
            </section>
            <section
              className={`${styles.section} shell-container`}
              id="tickets"
              aria-labelledby="tickets-title"
            >
              <div className={styles.sectionHead}>
                <span>03</span>
                <h2 id="tickets-title">Tickets</h2>
                <p>Published ticket types, live availability and order limits.</p>
              </div>
              {event.tickets.length ? (
                <div className={styles.tickets}>
                  {event.tickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} />
                  ))}
                </div>
              ) : (
                <p className={styles.notice} role="status">
                  No published ticket types are available.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </PublicShell>
  );
}

function schemaAvailability(availability: string) {
  return availability === "on_sale"
    ? "https://schema.org/InStock"
    : availability === "sold_out"
      ? "https://schema.org/SoldOut"
      : "https://schema.org/PreOrder";
}
