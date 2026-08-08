import type { Metadata } from "next";
import { getPublicEvent } from "../../../components/events/data";
import { EventDetails } from "../../../components/public-info/event-details";
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
import { publicImageURL } from "../../../lib/media";
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
    demo && !result.data ? demoEvents.find((item) => item.slug === slug) : null;
  const usingDemo = Boolean(demoEvent);
  const event = result.data ?? demoEvent ?? null;
  const url = canonicalURL(`/events/${slug}`, settings?.seo.canonical_base);
  // A published event's banner is its own; the demo map only covers fixtures.
  const cover =
    (await publicImageURL(event?.banner_asset_id ?? "")) ??
    (usingDemo && event ? demoEventCovers[event.slug] : undefined);
  return (
    <PublicShell
      settings={settings}
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
          <EventDetails event={event} coverSrc={cover} usingDemo={usingDemo} />
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
