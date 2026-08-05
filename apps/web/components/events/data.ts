import type {
  PublicEvent,
  PublicTicketType,
  TicketAvailability,
} from "./types";

type Result<T> = { state: "ready"; data: T } | { state: "error"; data: T };
const availability = new Set<TicketAvailability>([
  "scheduled",
  "on_sale",
  "paused",
  "sold_out",
  "sale_ended",
]);
const currencies = new Set(["GHS", "USD", "EUR", "GBP"]);

export async function getPublicEvents(): Promise<Result<PublicEvent[]>> {
  const base = process.env.API_BASE_URL;
  if (!base) return { state: "error", data: [] };
  try {
    const response = await fetch(`${base}/api/public/events`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return { state: "error", data: [] };
    const body = (await response.json()) as { items?: unknown[] };
    return {
      state: "ready",
      data: Array.isArray(body.items)
        ? body.items.filter(validEvent).sort(eventOrder)
        : [],
    };
  } catch {
    return { state: "error", data: [] };
  }
}

export async function getPublicEvent(
  slug: string,
): Promise<Result<PublicEvent | null>> {
  const base = process.env.API_BASE_URL;
  if (!base || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return { state: "error", data: null };
  try {
    const response = await fetch(
      `${base}/api/public/events/${encodeURIComponent(slug)}`,
      { cache: "no-store", signal: AbortSignal.timeout(2500) },
    );
    if (response.status === 404) return { state: "ready", data: null };
    if (!response.ok) return { state: "error", data: null };
    const body = (await response.json()) as unknown;
    return { state: "ready", data: validEvent(body) ? body : null };
  } catch {
    return { state: "error", data: null };
  }
}

export function activeFeaturedEvent(events: PublicEvent[], now = new Date()) {
  return events.find((event) => {
    const start = date(event.banner.starts_at);
    const end = date(event.banner.ends_at);
    return event.banner.featured && start && end && start <= now && now < end;
  });
}

function validEvent(value: unknown): value is PublicEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<PublicEvent>;
  return (
    uuidV4(event.id) &&
    typeof event.slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.slug) &&
    text(event.title) &&
    text(event.summary) &&
    text(event.description) &&
    Boolean(date(event.starts_at)) &&
    Boolean(date(event.ends_at)) &&
    date(event.ends_at)! > date(event.starts_at)! &&
    validTimezone(event.timezone) &&
    typeof event.banner_asset_id === "string" &&
    (event.banner_asset_id === "" || uuidV4(event.banner_asset_id)) &&
    validVenue(event.venue) &&
    validPolicies(event.policies) &&
    validBanner(event.banner) &&
    Array.isArray(event.tickets) &&
    event.tickets.every(validTicket) &&
    availability.has(event.availability as TicketAvailability)
  );
}

function validTicket(value: unknown): value is PublicTicketType {
  if (!value || typeof value !== "object") return false;
  const ticket = value as Partial<PublicTicketType>;
  return (
    uuidV4(ticket.id) &&
    text(ticket.name) &&
    typeof ticket.description === "string" &&
    /^\d+(?:\.\d{1,2})?$/.test(ticket.price ?? "") &&
    currencies.has(ticket.currency ?? "") &&
    positiveInteger(ticket.capacity) &&
    integer(ticket.sold) &&
    integer(ticket.reserved) &&
    ticket.sold! + ticket.reserved! <= ticket.capacity! &&
    positiveInteger(ticket.min_per_order) &&
    positiveInteger(ticket.max_per_order) &&
    ticket.min_per_order! <= ticket.max_per_order! &&
    ticket.max_per_order! <= ticket.capacity! &&
    Boolean(date(ticket.sales_start)) &&
    Boolean(date(ticket.sales_end)) &&
    date(ticket.sales_start)! < date(ticket.sales_end)! &&
    availability.has(ticket.availability as TicketAvailability) &&
    (!ticket.checkout_href || safeCheckout(ticket.checkout_href))
  );
}

function validVenue(value: unknown): value is PublicEvent["venue"] {
  if (!value || typeof value !== "object") return false;
  const venue = value as Partial<PublicEvent["venue"]>;
  return (
    text(venue.name) &&
    text(venue.address) &&
    text(venue.city) &&
    /^[A-Z]{2}$/.test(venue.country_code ?? "") &&
    (!venue.map_url || safeHTTPS(venue.map_url))
  );
}

function validPolicies(value: unknown): value is PublicEvent["policies"] {
  if (!value || typeof value !== "object") return false;
  const policy = value as Partial<PublicEvent["policies"]>;
  return (
    text(policy.refunds) &&
    text(policy.entry) &&
    integer(policy.age_limit) &&
    policy.age_limit! >= 0
  );
}

function validBanner(value: unknown): value is PublicEvent["banner"] {
  if (!value || typeof value !== "object") return false;
  const banner = value as Partial<PublicEvent["banner"]>;
  return (
    typeof banner.featured === "boolean" &&
    (!banner.featured ||
      (Boolean(date(banner.starts_at)) && Boolean(date(banner.ends_at))))
  );
}

function eventOrder(left: PublicEvent, right: PublicEvent) {
  return Date.parse(left.starts_at) - Date.parse(right.starts_at);
}
function date(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function validTimezone(value?: string) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function safeHTTPS(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
function safeCheckout(value: string) {
  return /^\/tickets\/checkout(?:\?|$)/.test(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function positiveInteger(value: unknown): value is number {
  return integer(value) && value > 0;
}
function uuidV4(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
