/**
 * Shared booking types, transport and time helpers.
 *
 * The create form moved out of a dialog and onto its own page, so the diary and
 * the editor are now separate route trees that still talk to the same endpoints
 * and must agree on Joe's business timezone. This module is what they share.
 */

export type Status = "tentative" | "confirmed" | "cancelled";

export type Booking = {
  id: string;
  enquiry_id: string;
  title: string;
  service_id: string;
  start_at: string;
  end_at: string;
  venue: string;
  city: string;
  country: string;
  status: Status;
  fee: string;
  currency: string;
  requirements: Record<string, string>;
  version: number;
};

export type Warning = Pick<
  Booking,
  "id" | "title" | "status" | "start_at" | "end_at"
> & { booking_id: string };

export type View = "month" | "week" | "list";

/** Stands in until the calendar endpoint reports the timezone held in settings. */
export const FALLBACK_TIMEZONE = "Africa/Accra";

/**
 * Where the booking editor lives. Bookings are only ever created there; dates
 * already in the diary are confirmed or cancelled from the calendar itself.
 */
export const bookingEditorHref = "/bookings/new";
export const bookingCalendarHref = "/bookings";

export async function api(path: string, init?: RequestInit) {
  const csrf = document.cookie.match(/(?:^|; )jk_admin_csrf=([^;]+)/)?.[1];
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error("Booking request failed");
  if (response.status === 204) return null;
  return response.json();
}

export const local = (value: string, timezone: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));

export function zonedISOString(value: string, timezone: string) {
  const [date, clock] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = clock.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const observed = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    candidate += desired - observed;
  }
  return new Date(candidate).toISOString();
}

export function calendarRange(anchor: Date, view: View, timezone: string) {
  const localAnchor = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: timezone,
  }).formatToParts(anchor);
  const values = Object.fromEntries(
    localAnchor.map((part) => [part.type, part.value]),
  );
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    values.weekday,
  );
  let start = new Date(Date.UTC(year, month - 1, day));
  let end: Date;
  if (view === "month") {
    start = new Date(Date.UTC(year, month - 1, 1));
    end = new Date(Date.UTC(year, month, 1));
  } else if (view === "week") {
    start.setUTCDate(start.getUTCDate() - weekday);
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 90);
  }
  const localMidnight = (date: Date) =>
    `${date.getUTCFullYear().toString().padStart(4, "0")}-${(
      date.getUTCMonth() + 1
    )
      .toString()
      .padStart(
        2,
        "0",
      )}-${date.getUTCDate().toString().padStart(2, "0")}T00:00`;
  return {
    start: new Date(zonedISOString(localMidnight(start), timezone)),
    end: new Date(zonedISOString(localMidnight(end), timezone)),
  };
}
