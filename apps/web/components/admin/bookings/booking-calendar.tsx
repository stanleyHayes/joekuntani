"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
    [timezone, setTimezone] = useState("Africa/Accra"),
    [view, setView] = useState<View>("month"),
    [anchor, setAnchor] = useState(() => new Date()),
    [message, setMessage] = useState(""),
    [warnings, setWarnings] = useState<Warning[]>([]);
  const range = useMemo(
    () => calendarRange(anchor, view, timezone),
    [anchor, timezone, view],
  );
  const rangeStart = range.start.toISOString();
  const rangeEnd = range.end.toISOString();
  const load = useCallback(async () => {
    try {
      const data = await api(
        `/api/admin/bookings?from=${encodeURIComponent(rangeStart)}&to=${encodeURIComponent(rangeEnd)}`,
      );
      setItems(data.items);
      setTimezone(data.timezone);
      setMessage("");
    } catch {
      setMessage("Bookings could not be loaded.");
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
      await load();
      setMessage(
        result.warnings.length
          ? "Booking saved with schedule warnings."
          : "Booking saved.",
      );
    } catch {
      setMessage("Booking could not be saved.");
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
    } catch {
      setMessage("Status could not be updated.");
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
      <header>
        <p>
          Business timezone: <strong>{timezone}</strong>
        </p>
        <div className={styles.toolbar} role="group" aria-label="Calendar view">
          {(["month", "week", "list"] as View[]).map((value) => (
            <button
              key={value}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {value}
            </button>
          ))}
          <label>
            Calendar date
            <input
              type="date"
              value={anchor.toISOString().slice(0, 10)}
              onChange={(e) =>
                setAnchor(new Date(`${e.target.value}T12:00:00Z`))
              }
            />
          </label>
          <a
            href={`/api/admin/bookings/calendar.ics?from=${encodeURIComponent(range.start.toISOString())}&to=${encodeURIComponent(range.end.toISOString())}`}
          >
            Export iCal
          </a>
        </div>
      </header>
      {message && <p role="status">{message}</p>}
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
      <form className={styles.form} onSubmit={create}>
        <h3>Add booking</h3>
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
          <input name="start_at" type="datetime-local" required />
        </label>
        <label>
          Ends
          <input name="end_at" type="datetime-local" required />
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
          <select name="status" defaultValue="tentative">
            <option value="tentative">Tentative</option>
            <option value="confirmed">Confirmed</option>
          </select>
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
      <div
        className={view === "list" ? styles.list : styles.calendar}
        data-view={view}
      >
        {grouped.length === 0 ? (
          <p>No bookings in this range.</p>
        ) : (
          grouped.map(([day, bookings]) => (
            <section className={styles.day} key={day}>
              <h3>{day}</h3>
              {bookings.map((item) => (
                <article key={item.id}>
                  <strong>{item.title}</strong>
                  <p>
                    {local(item.start_at, timezone)}–
                    {local(item.end_at, timezone)}
                  </p>
                  <p>
                    {item.venue}, {item.city} ·{" "}
                    <span className={styles[item.status]}>{item.status}</span>
                  </p>
                  {item.status !== "cancelled" && (
                    <div>
                      {item.status === "tentative" && (
                        <button onClick={() => status(item, "confirmed")}>
                          Confirm
                        </button>
                      )}
                      <button onClick={() => status(item, "cancelled")}>
                        Cancel
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))
        )}
      </div>
    </section>
  );
}
