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
  const upcoming = periodFor(event) === "Upcoming event";
  return (
    <article className={styles.card} data-availability={event.availability}>
      {coverSrc ? (
        <div className={styles.cardMedia} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverSrc} alt="" width={800} height={500} />
        </div>
      ) : null}
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <p className={styles.cardPeriod}>{periodFor(event)}</p>
          <p
            className={styles.cardStatus}
            data-tone={statusTone(event.availability)}
          >
            {availabilityLabel(event.availability)}
          </p>
        </div>
        <h2 className={styles.cardTitle}>{event.title}</h2>
        <p className={styles.cardSummary}>{event.summary}</p>
        <dl className={styles.cardFacts}>
          <div>
            <dt>When</dt>
            <dd>{formatDateRange(event)}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>
              {event.venue.name}
              <span className={styles.cardCity}> · {event.venue.city}</span>
            </dd>
          </div>
        </dl>
        <Link className={styles.cardCta} href={`/events/${event.slug}`}>
          {upcoming ? "Get tickets & details" : "View event details"}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export function TicketCard({ ticket }: { ticket: PublicTicketType }) {
  const remaining = Math.max(
    0,
    ticket.capacity - ticket.sold - ticket.reserved,
  );
  // Inventory decides availability, not the stored flag alone. A tier still
  // marked `on_sale` after its last seat went renders "0 remaining" — and used
  // to render a live checkout link beside it, sending buyers into an order that
  // cannot be filled. The flag lags the count; the count is the truth.
  const available = ticket.availability === "on_sale" && remaining > 0;
  return (
    <article className={styles.ticket}>
      <h3>{ticket.name}</h3>
      {ticket.description ? <p>{ticket.description}</p> : null}
      <p>
        {formatMoney(ticket.price, ticket.currency)} · {remaining} remaining
      </p>
      <p className={styles.status}>
        {remaining === 0 && ticket.availability === "on_sale"
          ? availabilityLabel("sold_out")
          : availabilityLabel(ticket.availability)}
      </p>
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
            : remaining === 0 && ticket.availability === "on_sale"
              ? availabilityLabel("sold_out")
              : availabilityLabel(ticket.availability)}
        </span>
      )}
    </article>
  );
}

export function formatDateRange(event: PublicEvent) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const sameDay =
    localDayKey(start, event.timezone) === localDayKey(end, event.timezone);
  if (sameDay) {
    return `${formatDay(start, event.timezone)} · ${formatTime(start, event.timezone)}–${formatTime(end, event.timezone)}`;
  }
  return `${formatDate(event.starts_at, event.timezone)} – ${formatDate(event.ends_at, event.timezone)}`;
}

export function periodFor(event: PublicEvent, now = new Date()) {
  return new Date(event.ends_at) < now ? "Past event" : "Upcoming event";
}

export function availabilityLabel(value: PublicEvent["availability"]) {
  return {
    scheduled: "Tickets scheduled",
    on_sale: "On sale",
    paused: "Sales paused",
    sold_out: "Sold out",
    sale_ended: "Sales closed",
  }[value];
}

function statusTone(value: PublicEvent["availability"]) {
  return {
    scheduled: "muted",
    on_sale: "live",
    paused: "warn",
    sold_out: "warn",
    sale_ended: "muted",
  }[value];
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatDay(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(value);
}

function formatTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
    timeZone,
  }).format(value);
}

function localDayKey(value: Date, timeZone: string) {
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

function formatMoney(value: string, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(Number(value));
}
