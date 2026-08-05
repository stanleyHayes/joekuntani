import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "../../components/events/event-ui";
import { getPublicEvents } from "../../components/events/data";
import type { PublicEvent } from "../../components/events/types";
import styles from "../../components/events/events.module.css";
import { PublicShell } from "../../components/layout/public-shell";
import { pageMetadata, unavailableMetadata } from "../../lib/seo";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicEvents();
  const input = {
    title: "Events",
    description: "Published upcoming and past Joe Kuntani events.",
    path: "/events",
  };
  return result.state === "ready" && result.data.length
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
  const [result, filters] = await Promise.all([
    getPublicEvents(),
    searchParams,
  ]);
  const events = filterEvents(result.data, filters);
  const cities = [
    ...new Set(result.data.map((event) => event.venue.city)),
  ].sort();
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
      <main id="main-content">
        <header className={`${styles.hero} shell-container`}>
          <p className="eyebrow">Live events</p>
          <h1>Events</h1>
          <p className={styles.lede}>
            Published event dates, venues, access information and live ticket
            status.
          </p>
        </header>
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="event-list"
        >
          <h2 id="event-list">Find an event</h2>
          <form className={styles.filters} action="/events" method="get">
            <label className={styles.filter}>
              City
              <select name="city" defaultValue={filters.city ?? ""}>
                <option value="">All cities</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filter}>
              Date
              <input
                name="date"
                type="date"
                defaultValue={safeDate(filters.date)}
              />
            </label>
            <label className={styles.filter}>
              Time
              <select name="period" defaultValue={filters.period ?? "upcoming"}>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
                <option value="all">All dates</option>
              </select>
            </label>
            <label className={styles.filter}>
              Tickets
              <select
                name="availability"
                defaultValue={filters.availability ?? "all"}
              >
                <option value="all">All states</option>
                <option value="on_sale">On sale</option>
                <option value="scheduled">Scheduled</option>
                <option value="paused">Sales paused</option>
                <option value="sold_out">Sold out</option>
                <option value="sale_ended">Sales closed</option>
              </select>
            </label>
            <div className={styles.actions}>
              <button type="submit">Apply filters</button>
              <Link href="/events">Clear filters</Link>
            </div>
          </form>
          {result.state === "error" ? (
            <p className={styles.notice} role="alert">
              Published events are temporarily unavailable. No event or ticket
              details have been inferred.
            </p>
          ) : events.length ? (
            <div className={styles.grid}>
              {events.map((event) => (
                <EventCard event={event} key={event.id} />
              ))}
            </div>
          ) : (
            <p className={styles.notice} role="status">
              No published events match these filters.
            </p>
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
