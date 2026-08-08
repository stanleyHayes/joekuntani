import type { Metadata } from "next";
import { eventCovers } from "../../lib/media";
import { getPublicSettings } from "../../lib/settings";
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
  return hasEvents
    ? pageMetadata(input)
    : unavailableMetadata(input.title, input.description);
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
  const shellSettings = await getPublicSettings();
  const [result, filters] = await Promise.all([
    getPublicEvents(),
    searchParams,
  ]);
  const demo = demoContentEnabled();
  const usingDemo = demo && result.data.length === 0;
  const source = usingDemo ? demoEvents : result.data;
  const events = filterEvents(source, filters);
  // Published events carry their own banner; the demo map is only a fallback
  // for the fixture path.
  const covers = await eventCovers(events);
  const cities = [...new Set(source.map((event) => event.venue.city))].sort();
  return (
    <PublicShell
      settings={shellSettings}
      currentPath="/events"
      footerCta={{
        href: "/contact",
        label: "Ask about an event",
        title: "Need event information?",
        description: "Use the approved contact route for event questions.",
      }}
    >
      {usingDemo ? <DemoBanner /> : null}
      <main id="main-content" className={styles.eventStage}>
        <header className={`${styles.hero} shell-container`}>
          <div className={styles.heroTop}>
            <p className={styles.heroKicker}>
              {usingDemo ? "Demo programme" : "Live programme"}
            </p>
            <p className={styles.heroCount}>
              {String(events.length).padStart(2, "0")} dates listed
            </p>
          </div>
          <div className={styles.heroTitle}>
            <h1>See Joe live.</h1>
            <p className={styles.lede}>
              {usingDemo
                ? "Demo ticketed nights for layout review — sample dates and ticket states only."
                : "Published dates, venue information, accessibility notes and current ticket status."}
            </p>
          </div>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="event-list"
        >
          <div className={styles.sectionHead}>
            <span>01</span>
            <h2 id="event-list">Find an event</h2>
            <p>Filter the programme by city, date or ticket availability.</p>
          </div>
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
                    covers[event.id] ??
                    (usingDemo ? demoEventCovers[event.slug] : undefined)
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
