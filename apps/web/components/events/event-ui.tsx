import Link from "next/link";
import type { PublicEvent, PublicTicketType } from "./types";
import styles from "./events.module.css";

export function ScheduledEventBanner({ event }: { event: PublicEvent }) {
  return (
    <section
      className={`${styles.section} shell-container`}
      aria-labelledby="scheduled-event"
    >
      <div className={styles.banner}>
        <p className="eyebrow">Featured event</p>
        <h2 id="scheduled-event">{event.title}</h2>
        <p>{event.summary}</p>
        <p className={styles.meta}>
          {formatDateRange(event)} · {event.venue.city}
        </p>
        <Link className={styles.primary} href={`/events/${event.slug}`}>
          View event and tickets
        </Link>
      </div>
    </section>
  );
}

export function EventCard({
  event,
  coverSrc,
}: {
  event: PublicEvent;
  coverSrc?: string;
}) {
  return (
    <article className={styles.card}>
      {coverSrc ? (
        <div className={styles.cardMedia} aria-hidden="true">
          {/* Demo/CMS cover; next/image optional for fixture paths. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverSrc} alt="" width={800} height={500} />
        </div>
      ) : null}
      <p className="eyebrow">{periodFor(event)}</p>
      <h2>{event.title}</h2>
      <p>{event.summary}</p>
      <p className={styles.meta}>{formatDateRange(event)}</p>
      <p className={styles.meta}>
        {event.venue.name} · {event.venue.city}
      </p>
      <p className={styles.status}>{availabilityLabel(event.availability)}</p>
      <Link className={styles.primary} href={`/events/${event.slug}`}>
        View event details
      </Link>
    </article>
  );
}

export function TicketCard({ ticket }: { ticket: PublicTicketType }) {
  const available = ticket.availability === "on_sale";
  const remaining = Math.max(
    0,
    ticket.capacity - ticket.sold - ticket.reserved,
  );
  return (
    <article className={styles.ticket}>
      <h3>{ticket.name}</h3>
      {ticket.description ? <p>{ticket.description}</p> : null}
      <p>
        {formatMoney(ticket.price, ticket.currency)} · {remaining} remaining
      </p>
      <p className={styles.status}>{availabilityLabel(ticket.availability)}</p>
      <p className={styles.meta}>
        Sales close {formatDate(ticket.sales_end, "UTC")}. Order limit{" "}
        {ticket.min_per_order}–{ticket.max_per_order}.
      </p>
      {available && ticket.checkout_href ? (
        <a className={styles.primary} href={ticket.checkout_href}>
          Choose this ticket
        </a>
      ) : (
        <span
          className={`${styles.primary} ${styles.disabled}`}
          aria-disabled="true"
        >
          {available
            ? "Checkout coming soon"
            : availabilityLabel(ticket.availability)}
        </span>
      )}
    </article>
  );
}

export function formatDateRange(event: PublicEvent) {
  const start = formatDate(event.starts_at, event.timezone);
  const end = formatDate(event.ends_at, event.timezone);
  return `${start} to ${end}`;
}

export function periodFor(event: PublicEvent, now = new Date()) {
  return new Date(event.ends_at) < now ? "Past event" : "Upcoming event";
}

export function availabilityLabel(value: PublicEvent["availability"]) {
  return {
    scheduled: "Tickets scheduled",
    on_sale: "Tickets on sale",
    paused: "Ticket sales paused",
    sold_out: "Sold out",
    sale_ended: "Ticket sales closed",
  }[value];
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatMoney(value: string, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(Number(value));
}
