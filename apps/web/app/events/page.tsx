import type { Metadata } from "next";
import { EventCard } from "../../components/events/event-ui";
import { EventFilters } from "../../components/events/event-filters";
import { getPublicEvents } from "../../components/events/data";
import type { PublicEvent } from "../../components/events/types";
import styles from "../../components/events/events.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { DemoBanner } from "../../components/ui/demo-banner";
import { EmptyState } from "../../components/ui/empty-state";
import {
  demoContentEnabled,
  demoEventCovers,
  demoEvents,
} from "../../lib/demo/content";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicEvents();
  const demo = demoContentEnabled();
  const hasEvents = result.data.length > 0 || demo;
  const input = {
    title: "Events",
    description: "Published upcoming and past Joe Kuntani events.",
    path: "/events",
  };
  return hasEvents ? pageMetadata(input) : unavailableMetadata(input.title, input.description);
}

type Filters = {
  city?: string;
  date?: string;
  period?: string;
  availability?: string;
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const [result, filters] = await Promise.all([
    getPublicEvents(),
    searchParams,
  ]);
  const demo = demoContentEnabled();
  const usingDemo = demo && result.data.length === 0;
  const source = usingDemo ? demoEvents : result.data;
  const events = filterEvents(source, filters);
  const cities = [...new Set(source.map((event) => event.venue.city))].sort();
  return (
    <PublicShell
      currentPath="/events"
      footerCta={{
        href: "/contact",
        label: "Ask about an event",
        title: "Need event information?",
        description: "Use the approved contact route for event questions.",
      }}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <p className="eyebrow">
            {usingDemo ? "Demo preview" : "Live events"}
          </p>
          <h1>Events</h1>
          <p className={styles.lede}>
            {usingDemo
              ? "Demo ticketed nights for layout review — Accra and Kumasi rooms with sample ticket states. Replace via Events admin before marketing."
              : "Published event dates, venues, access information and live ticket status."}
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="event-list"
        >
          <h2 id="event-list">Find an event</h2>
          <EventFilters
            cities={cities}
            filters={filters}
            safeDate={safeDate(filters.date)}
          />
          {result.state === "error" && !usingDemo ? (
            <p className={styles.notice} role="alert">
              Published events are temporarily unavailable. No event or ticket
              details have been inferred.
            </p>
          ) : events.length ? (
            <div className={styles.grid}>
              {events.map((event) => (
                <EventCard
                  event={event}
                  key={event.id}
                  coverSrc={
                    usingDemo ? demoEventCovers[event.slug] : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No matching events"
              description="No published events match these filters. Clear filters or check back when new dates are published."
              tone="calendar"
            />
          )}
        </section>
      </main>
    </PublicShell>
  );
}

export function filterEvents(
  events: PublicEvent[],
  filters: Filters,
  now = new Date(),
) {
  const dateFilter = safeDate(filters.date);
  return events.filter((event) => {
    const start = new Date(event.starts_at);
    const upcoming = new Date(event.ends_at) >= now;
    return (
      (!filters.city || event.venue.city === filters.city) &&
      (!dateFilter || localDate(start, event.timezone) === dateFilter) &&
      periodMatches(filters.period, upcoming) &&
      (!filters.availability ||
        filters.availability === "all" ||
        event.availability === filters.availability)
    );
  });
}

function safeDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}
function localDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function periodMatches(period: string | undefined, upcoming: boolean) {
  if (period === "all") return true;
  return period === "past" ? !upcoming : upcoming;
}
