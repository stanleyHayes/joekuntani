"use client";

import { CalendarPlusIcon } from "@phosphor-icons/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DateField } from "../../ui/date-field";
import { EmptyState } from "../../ui/empty-state";
import { Select } from "../../ui/select";
import { AdminDialog } from "../admin-dialog";
import { AdminErrorState } from "../admin-feedback";
import styles from "./booking-calendar.module.css";

type Status = "tentative" | "confirmed" | "cancelled";
type Booking = {
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
type Warning = Pick<
  Booking,
  "id" | "title" | "status" | "start_at" | "end_at"
> & { booking_id: string };
type View = "month" | "week" | "list";

async function api(path: string, init?: RequestInit) {
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
const local = (value: string, timezone: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
function zonedISOString(value: string, timezone: string) {
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
export function BookingCalendar() {
  const [items, setItems] = useState<Booking[]>([]),
    [createOpen, setCreateOpen] = useState(false),
    [timezone, setTimezone] = useState("Africa/Accra"),
    [view, setView] = useState<View>("month"),
    [anchor, setAnchor] = useState(() => new Date()),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [warnings, setWarnings] = useState<Warning[]>([]);
  const range = useMemo(
    () => calendarRange(anchor, view, timezone),
    [anchor, timezone, view],
  );
  const rangeStart = range.start.toISOString();
  const rangeEnd = range.end.toISOString();
  const rangeLabel = useMemo(() => {
    const format = new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      timeZone: timezone,
    });
    // `range.end` is the exclusive upper bound, so step back inside it before
    // labelling — otherwise August reads as "1 Aug – 1 Sep".
    const lastDay = new Date(range.end.getTime() - 1);
    return `${format.format(range.start)} – ${format.format(lastDay)}`;
  }, [range.end, range.start, timezone]);
  const load = useCallback(async () => {
    try {
      const data = await api(
        `/api/admin/bookings?from=${encodeURIComponent(rangeStart)}&to=${encodeURIComponent(rangeEnd)}`,
      );
      setItems(data?.items ?? []);
      if (data?.timezone) setTimezone(data.timezone);
      setMessage("");
      setError("");
    } catch {
      // Drop the stale range so the failure banner is never contradicted by
      // "No bookings in this range" — that claim needs a successful read.
      setItems([]);
      setError("Bookings could not be loaded.");
    }
  }, [rangeEnd, rangeStart]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await api("/api/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          enquiry_id: data.get("enquiry_id"),
          title: data.get("title"),
          service_id: data.get("service_id"),
          start_at: zonedISOString(String(data.get("start_at")), timezone),
          end_at: zonedISOString(String(data.get("end_at")), timezone),
          venue: data.get("venue"),
          city: data.get("city"),
          country: String(data.get("country")).toUpperCase(),
          status: data.get("status"),
          fee: data.get("fee"),
          currency: String(data.get("currency")).toUpperCase(),
          requirements: { notes: String(data.get("requirements") ?? "") },
          version: 0,
        }),
      });
      setWarnings(result.warnings);
      form.reset();
      setCreateOpen(false);
      await load();
      setMessage(
        result.warnings.length
          ? "Booking saved with schedule warnings."
          : "Booking saved.",
      );
      setError("");
    } catch {
      setError("Booking could not be saved.");
    }
  }
  async function status(item: Booking, next: Status) {
    try {
      const result = await api(`/api/admin/bookings/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          enquiry_id: item.enquiry_id,
          title: item.title,
          service_id: item.service_id,
          start_at: item.start_at,
          end_at: item.end_at,
          venue: item.venue,
          city: item.city,
          country: item.country,
          status: next,
          fee: item.fee,
          currency: item.currency,
          requirements: item.requirements,
          version: item.version,
        }),
      });
      setWarnings(result.warnings);
      await load();
      setMessage(
        result.warnings.length
          ? "Status updated with schedule warnings."
          : "Status updated.",
      );
      setError("");
    } catch {
      setError("Status could not be updated.");
    }
  }
  const grouped = useMemo(
    () =>
      Object.entries(
        items.reduce<Record<string, Booking[]>>((all, item) => {
          const key = new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: timezone,
          }).format(new Date(item.start_at));
          (all[key] ??= []).push(item);
          return all;
        }, {}),
      ),
    [items, timezone],
  );
  return (
    <section className={styles.workspace} aria-live="polite">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Joe’s diary</p>
          <h2>Where Joe is playing</h2>
          <p className="stage-head__lede">
            Hold, confirm and cancel Joe’s dates. Times are read and written in
            his business timezone, <strong>{timezone}</strong>.
          </p>
        </div>
        <div className="stage-head__actions">
          <button
            className="primary"
            type="button"
            onClick={() => setCreateOpen(true)}
          >
            Add booking
          </button>
        </div>
      </header>
      <div className="stage-filters">
        <div className="stage-filters__head">
          <p className="stage-filters__title">Range</p>
          <p className="stage-filters__meta">
            {error
              ? "Range unavailable"
              : `${items.length} ${items.length === 1 ? "booking" : "bookings"} · ${rangeLabel}`}
          </p>
        </div>
        <div className={styles.rangeRow}>
          <div
            className={styles.segmented}
            role="group"
            aria-label="Calendar view"
          >
            {(["month", "week", "list"] as View[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
              >
                {value[0]?.toUpperCase()}
                {value.slice(1)}
              </button>
            ))}
          </div>
          <label className={styles.dateField}>
            Calendar date
            <DateField
              aria-label="Calendar date"
              mode="date"
              value={anchor.toISOString().slice(0, 10)}
              onChange={(value) =>
                setAnchor(new Date(`${value || "1970-01-01"}T12:00:00Z`))
              }
            />
          </label>
          <a
            className={styles.exportLink}
            href={`/api/admin/bookings/calendar.ics?from=${encodeURIComponent(range.start.toISOString())}&to=${encodeURIComponent(range.end.toISOString())}`}
          >
            <CalendarPlusIcon size={15} aria-hidden="true" />
            Export iCal
          </a>
        </div>
      </div>
      {message && <p role="status">{message}</p>}
      {error ? (
        <AdminErrorState
          title="Bookings are unavailable"
          message={error}
          retry={error === "Bookings could not be loaded."}
        />
      ) : null}
      {warnings.length > 0 && (
        <aside className={styles.warning}>
          <h3>Schedule conflicts</h3>
          <ul>
            {warnings.map((w) => (
              <li key={w.booking_id}>
                <strong>{w.status}</strong> {w.title}:{" "}
                {local(w.start_at, timezone)}–{local(w.end_at, timezone)}
              </li>
            ))}
          </ul>
        </aside>
      )}
      {createOpen ? (
        <AdminDialog
          title="Add booking"
          description="Create a calendar booking from an existing CRM enquiry."
          onClose={() => setCreateOpen(false)}
          wide
        >
          <form className={styles.form} onSubmit={create}>
            <label>
              Title
              <input name="title" required minLength={2} />
            </label>
            <label>
              CRM enquiry ID
              <input name="enquiry_id" required pattern="[0-9a-f-]{36}" />
            </label>
            <label>
              Service ID
              <input name="service_id" required pattern="[0-9a-f-]{36}" />
            </label>
            <label>
              Starts
              <DateField
                name="start_at"
                aria-label="Starts"
                mode="datetime"
                required
              />
            </label>
            <label>
              Ends
              <DateField
                name="end_at"
                aria-label="Ends"
                mode="datetime"
                required
              />
            </label>
            <label>
              Venue
              <input name="venue" maxLength={200} />
            </label>
            <label>
              City
              <input name="city" maxLength={100} />
            </label>
            <label>
              Country
              <input name="country" defaultValue="GH" maxLength={2} />
            </label>
            <label>
              Status
              <Select
                name="status"
                defaultValue="tentative"
                options={[
                  { value: "tentative", label: "Tentative" },
                  { value: "confirmed", label: "Confirmed" },
                ]}
                aria-label="Booking status"
              />
            </label>
            <label>
              Fee
              <input name="fee" defaultValue="0.00" inputMode="decimal" />
            </label>
            <label>
              Currency
              <input name="currency" defaultValue="GHS" maxLength={3} />
            </label>
            <label>
              Requirements
              <textarea name="requirements" maxLength={500} />
            </label>
            <button type="submit">Create booking</button>
          </form>
        </AdminDialog>
      ) : null}
      {error ? null : grouped.length === 0 ? (
        <EmptyState
          tone="calendar"
          title="Joe’s diary is clear here"
          description={`Nothing is booked between ${rangeLabel}. Widen the view, or put the first hold in the diary.`}
          action={
            <button type="button" onClick={() => setCreateOpen(true)}>
              Add booking
            </button>
          }
        />
      ) : (
        <div
          className={view === "list" ? styles.list : styles.calendar}
          data-view={view}
        >
          {grouped.map(([day, bookings]) => (
            <section className={styles.day} key={day}>
              <h3>{day}</h3>
              {bookings.map((item) => (
                <article key={item.id}>
                  <div className={styles.bookingHead}>
                    <strong>{item.title}</strong>
                    <span className={styles.pill} data-status={item.status}>
                      {item.status}
                    </span>
                  </div>
                  <p className={styles.time}>
                    {local(item.start_at, timezone)} –{" "}
                    {local(item.end_at, timezone)}
                  </p>
                  <p className={styles.place}>
                    {[item.venue, item.city].filter(Boolean).join(", ") ||
                      "Location to be confirmed"}
                  </p>
                  {item.status !== "cancelled" && (
                    <div className={styles.bookingActions}>
                      {item.status === "tentative" && (
                        <button onClick={() => status(item, "confirmed")}>
                          Confirm
                        </button>
                      )}
                      <button
                        className={styles.cancelAction}
                        onClick={() => status(item, "cancelled")}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
