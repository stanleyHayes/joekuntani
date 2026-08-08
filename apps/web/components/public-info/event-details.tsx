import { availabilityLabel, formatDateRange } from "../events/event-ui";
import type { PublicEvent, PublicTicketType } from "../events/types";
import styles from "./event-details.module.css";

export type EventDetailsProps = {
  event: PublicEvent;
  /** Cover image for the event. Only the demo dataset ships one today. */
  coverSrc?: string;
  /** Renders the demo provenance labels when the page fell back to demo data. */
  usingDemo?: boolean;
};

/**
 * The public event detail surface: what/when/where first, then the venue,
 * then the ticket tiers, then the rules that decide whether a visitor can
 * actually turn up. Everything a visitor needs to commit to buying is above
 * the ticket list; the list itself only has to confirm the price.
 */
export function EventDetails({
  event,
  coverSrc,
  usingDemo = false,
}: EventDetailsProps) {
  const tiers = event.tickets.map((ticket) => describeTier(ticket, event));
  const action = primaryAction(tiers);
  const cheapest = cheapestTicket(event.tickets);
  const description = event.description.trim();

  return (
    <article className={styles.stage} aria-labelledby="event-title">
      <header className={`${styles.hero} shell-container`}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">{usingDemo ? "Demo event" : "Live event"}</p>
          <h1 className={styles.title} id="event-title">
            {event.title}
          </h1>
          <p className={styles.lede}>{event.summary}</p>
          <dl className={styles.heroFacts}>
            <div>
              <dt>When</dt>
              <dd>{formatDateRange(event)}</dd>
              <dd className={styles.heroFactNote}>{event.timezone} time</dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>{event.venue.name}</dd>
              <dd className={styles.heroFactNote}>
                {event.venue.city}, {event.venue.country_code}
              </dd>
            </div>
          </dl>
        </div>
        <div className={styles.heroAside}>
          {coverSrc ? (
            <figure className={styles.cover}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverSrc} alt="" width={1600} height={900} />
              {usingDemo ? (
                <figcaption>Demo media — replace via CMS</figcaption>
              ) : null}
            </figure>
          ) : null}
          <div className={styles.buyBox}>
            <p
              className={styles.buyStatus}
              data-tone={eventTone(event.availability)}
            >
              {availabilityLabel(event.availability)}
            </p>
            <p className={styles.buyPrice}>
              {cheapest
                ? `From ${formatMoney(cheapest.price, cheapest.currency)}`
                : "Pricing to be announced"}
            </p>
            {action.href ? (
              <a className={styles.cta} href={action.href}>
                {action.label}
              </a>
            ) : (
              <button
                className={`${styles.cta} ${styles.ctaDisabled}`}
                type="button"
                disabled
              >
                {action.label}
              </button>
            )}
            <p className={styles.buyNote}>
              {tiers.length
                ? `${tiers.length} ticket ${tiers.length === 1 ? "type" : "types"} published`
                : "Ticket types for this date have not been published yet."}
            </p>
          </div>
        </div>
      </header>

      {description ? (
        <section
          className={`${styles.section} shell-container`}
          aria-labelledby="event-about"
        >
          <div className={styles.sectionHead}>
            <span>01</span>
            <h2 id="event-about">About this event</h2>
          </div>
          <p className={styles.prose}>{description}</p>
        </section>
      ) : null}

      <section
        className={`${styles.section} shell-container`}
        aria-labelledby="event-venue"
      >
        <div className={styles.sectionHead}>
          <span>02</span>
          <h2 id="event-venue">Venue and arrival</h2>
          <p>Where this date happens, and how to get in.</p>
        </div>
        <div className={styles.venuePanel}>
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
              Open venue map
            </a>
          ) : null}
          {event.venue.accessibility ? (
            <div className={styles.accessNote}>
              <h3>Venue accessibility</h3>
              <p>{event.venue.accessibility}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section
        className={`${styles.section} shell-container`}
        id="tickets"
        aria-labelledby="event-tickets"
      >
        <div className={styles.sectionHead}>
          <span>03</span>
          <h2 id="event-tickets">Tickets</h2>
          <p>Published tiers, live availability and order limits.</p>
        </div>
        {tiers.length ? (
          <ul className={styles.tiers}>
            {tiers.map((tier) => (
              <li key={tier.ticket.id}>
                <TicketTier tier={tier} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.notice} role="status">
            No published ticket types are available.
          </p>
        )}
      </section>

      <section
        className={`${styles.section} shell-container`}
        aria-labelledby="event-policies"
      >
        <div className={styles.sectionHead}>
          <span>04</span>
          <h2 id="event-policies">Before you book</h2>
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
            <p>{ageGuidance(event.policies)}</p>
          </article>
          {event.policies.accessibility ? (
            <article className={styles.policy}>
              <h3>Accessibility</h3>
              <p>{event.policies.accessibility}</p>
            </article>
          ) : null}
        </div>
      </section>
    </article>
  );
}

function TicketTier({ tier }: { tier: TierView }) {
  const { ticket } = tier;
  return (
    <article
      className={styles.tier}
      data-tone={tier.tone}
      aria-labelledby={`tier-${ticket.id}`}
    >
      <div className={styles.tierHead}>
        <h3 className={styles.tierName} id={`tier-${ticket.id}`}>
          {ticket.name}
        </h3>
        <p className={styles.tierStatus} data-tone={tier.tone}>
          {tier.statusLabel}
        </p>
      </div>
      <p className={styles.tierPrice}>
        {formatMoney(ticket.price, ticket.currency)}
      </p>
      {ticket.description ? (
        <p className={styles.tierCopy}>{ticket.description}</p>
      ) : null}
      <dl className={styles.tierFacts}>
        <div>
          <dt>Availability</dt>
          <dd>
            {tier.soldOut
              ? "None left"
              : `${tier.remaining} of ${ticket.capacity} left`}
          </dd>
        </div>
        <div>
          <dt>{tier.windowLabel}</dt>
          <dd>{tier.windowValue}</dd>
        </div>
        <div>
          <dt>Order limit</dt>
          <dd>
            {ticket.min_per_order}–{ticket.max_per_order} per order
          </dd>
        </div>
      </dl>
      {tier.buyable && ticket.checkout_href ? (
        <a className={styles.tierCta} href={ticket.checkout_href}>
          Buy {ticket.name}
        </a>
      ) : (
        <button
          className={`${styles.tierCta} ${styles.tierCtaDisabled}`}
          type="button"
          disabled
        >
          {tier.actionLabel}
        </button>
      )}
    </article>
  );
}

type TierView = {
  ticket: PublicTicketType;
  remaining: number;
  soldOut: boolean;
  buyable: boolean;
  tone: "live" | "warn" | "muted";
  statusLabel: string;
  actionLabel: string;
  windowLabel: string;
  windowValue: string;
};

/**
 * Turns the raw counters the API sends into the one thing a visitor needs to
 * know: can I buy this right now, and if not, why not.
 */
function describeTier(ticket: PublicTicketType, event: PublicEvent): TierView {
  const remaining = Math.max(
    0,
    ticket.capacity - ticket.sold - ticket.reserved,
  );
  // A tier with nothing left is sold out no matter what the API's own flag
  // says — never offer checkout against zero inventory.
  const soldOut = ticket.availability === "sold_out" || remaining === 0;
  const buyable =
    ticket.availability === "on_sale" &&
    !soldOut &&
    Boolean(ticket.checkout_href);
  const scheduled = ticket.availability === "scheduled";
  return {
    ticket,
    remaining,
    soldOut,
    buyable,
    tone: tierTone(ticket.availability, soldOut),
    statusLabel: soldOut ? "Sold out" : availabilityLabel(ticket.availability),
    actionLabel: tierActionLabel(ticket, event, soldOut),
    windowLabel: scheduled ? "Sales open" : "Sales close",
    windowValue: formatMoment(
      scheduled ? ticket.sales_start : ticket.sales_end,
      event.timezone,
    ),
  };
}

function tierActionLabel(
  ticket: PublicTicketType,
  event: PublicEvent,
  soldOut: boolean,
) {
  if (soldOut) return "Sold out";
  if (ticket.availability === "scheduled")
    return `On sale ${formatMoment(ticket.sales_start, event.timezone)}`;
  if (ticket.availability === "paused") return "Sales paused";
  if (ticket.availability === "sale_ended") return "Sales closed";
  return "Checkout opening soon";
}

function tierTone(
  availability: PublicTicketType["availability"],
  soldOut: boolean,
): TierView["tone"] {
  if (soldOut || availability === "paused") return "warn";
  if (availability === "on_sale") return "live";
  return "muted";
}

function eventTone(availability: PublicEvent["availability"]) {
  if (availability === "on_sale") return "live";
  if (availability === "paused" || availability === "sold_out") return "warn";
  return "muted";
}

/**
 * One call to action. It goes straight to checkout when there is exactly one
 * way to buy, sends the visitor to the tier list when there is a choice, and
 * never pretends to be clickable when nothing can be bought.
 */
function primaryAction(tiers: TierView[]): { href?: string; label: string } {
  const buyable = tiers.filter((tier) => tier.buyable);
  if (buyable.length === 1)
    return { href: buyable[0].ticket.checkout_href, label: "Buy tickets" };
  if (buyable.length > 1)
    return { href: "#tickets", label: "Choose your ticket" };
  if (!tiers.length) return { label: "Tickets unavailable" };
  if (tiers.every((tier) => tier.soldOut)) return { label: "Sold out" };
  return { href: "#tickets", label: "See ticket availability" };
}

function cheapestTicket(tickets: PublicTicketType[]) {
  return tickets.reduce<PublicTicketType | null>((best, ticket) => {
    const price = parsePrice(ticket.price);
    if (price === null) return best;
    const bestPrice = best ? parsePrice(best.price) : null;
    return bestPrice === null || price < bestPrice ? ticket : best;
  }, null);
}

function ageGuidance(policies: PublicEvent["policies"]) {
  const guidance = policies.age_guidance?.trim();
  if (guidance) return guidance;
  return policies.age_limit > 0
    ? `Minimum age ${policies.age_limit}`
    : "All ages welcome";
}

/**
 * Prices arrive as strings. A blank one must not become free — `Number("")`
 * is 0 — and a broken one must not render "$NaN" at a visitor.
 */
function parsePrice(value: string) {
  const amount = Number(value);
  return value.trim() && Number.isFinite(amount) ? amount : null;
}

function formatMoney(value: string, currency: string) {
  const amount = parsePrice(value);
  if (amount === null) return "Price on request";
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    amount,
  );
}

/** Sales windows are optional upstream; a missing one must not throw. */
function formatMoment(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "To be confirmed";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}
