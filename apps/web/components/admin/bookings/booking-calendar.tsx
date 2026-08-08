"use client";

import { CalendarPlusIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DateField } from "../../ui/date-field";
import { EmptyState } from "../../ui/empty-state";
import { AdminErrorState } from "../admin-feedback";
import {
  api,
  type Booking,
  bookingEditorHref,
  calendarRange,
  local,
  type Status,
  type View,
  type Warning,
} from "./booking-api";
import styles from "./booking-calendar.module.css";
import { ScheduleConflicts } from "./schedule-conflicts";

export function BookingCalendar() {
  const [items, setItems] = useState<Booking[]>([]),
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
          <Link className={styles.addBooking} href={bookingEditorHref}>
            Add booking
          </Link>
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
      <ScheduleConflicts timezone={timezone} warnings={warnings} />
      {error ? null : grouped.length === 0 ? (
        <EmptyState
          tone="calendar"
          title="Joe’s diary is clear here"
          description={`Nothing is booked between ${rangeLabel}. Widen the view, or put the first hold in the diary.`}
          action={
            <Link className={styles.emptyAction} href={bookingEditorHref}>
              Add booking
            </Link>
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
