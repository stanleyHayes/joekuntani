"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { DateField } from "../../ui/date-field";
import { Select } from "../../ui/select";
import { AdminSkeleton } from "../admin-feedback";
import {
  api,
  bookingCalendarHref,
  FALLBACK_TIMEZONE,
  type Warning,
  zonedISOString,
} from "./booking-api";
import styles from "./booking-editor.module.css";
import { ScheduleConflicts } from "./schedule-conflicts";

/**
 * The booking editor, as a page.
 *
 * It used to be a dialog carrying twelve controls, two of which are date
 * pickers whose panels had to open inside a modal that already scrolled — and a
 * modal that scrolls hides its own save button. On a page the form has room,
 * the browser's back button means what it says, and a half-filled booking
 * survives a stray click outside it.
 */
export function BookingEditor() {
  const router = useRouter();
  const [timezone, setTimezone] = useState("");
  const [conflicts, setConflicts] = useState<Warning[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // The calendar listing is the only response that publishes Joe's business
  // timezone, so ask it for an hour and read the timezone off the envelope; the
  // bookings that come back are not used. Every time this form writes is
  // converted through that zone, so the fields wait rather than guess.
  useEffect(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 60 * 60 * 1000);
    const timer = window.setTimeout(() => {
      void api(
        `/api/admin/bookings?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      )
        .then((data) => setTimezone(data?.timezone || FALLBACK_TIMEZONE))
        .catch(() => setTimezone(FALLBACK_TIMEZONE));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
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
      if (result.warnings.length) {
        // An overlap is only named in the response to the save that caused it.
        // Returning to the diary would throw that away, so the save ends here
        // with the clash still on screen.
        setConflicts(result.warnings);
        setPending(false);
        return;
      }
      // Back to the diary, which reloads and shows the date. Staying here would
      // leave an operator wondering whether the save took.
      router.push(bookingCalendarHref);
      router.refresh();
    } catch {
      setError("Booking could not be saved.");
      setPending(false);
    }
  }

  // Both branches carry the live region, so it exists before the save swaps the
  // form out for its result — a region announced into being is a region a
  // screen reader is free to ignore.
  if (conflicts)
    return (
      <section className={styles.editor} aria-live="polite">
        <header className="stage-head">
          <div className="stage-head__copy">
            <p className="stage-head__eyebrow">Joe’s diary</p>
            <h2>Booking saved</h2>
            <p className="stage-head__lede">
              The date is in the diary. It runs over dates Joe already holds, so
              read the clashes before you leave this page.
            </p>
          </div>
          <div className="stage-head__actions">
            <Link className={styles.back} href={bookingCalendarHref}>
              Back to the diary
            </Link>
          </div>
        </header>
        <p role="status">Booking saved with schedule warnings.</p>
        <ScheduleConflicts timezone={timezone} warnings={conflicts} />
      </section>
    );

  if (!timezone) return <AdminSkeleton label="Loading booking" variant="form" />;

  return (
    <section
      className={styles.editor}
      aria-labelledby="booking-editor-heading"
      aria-live="polite"
    >
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Joe’s diary</p>
          <h2 id="booking-editor-heading">Add booking</h2>
          <p className="stage-head__lede">
            Create a calendar booking from an existing CRM enquiry. Times are
            written in Joe’s business timezone, <strong>{timezone}</strong>.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.back} href={bookingCalendarHref}>
            Back to the diary
          </Link>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <form className={styles.form} onSubmit={create}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Booking</legend>
          <div className={styles.fieldGrid}>
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
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Schedule</legend>
          <div className={styles.fieldGrid}>
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
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Where</legend>
          <div className={styles.fieldGrid}>
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
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Fee and requirements</legend>
          <div className={styles.fieldGrid}>
            <label>
              Fee
              <input name="fee" defaultValue="0.00" inputMode="decimal" />
            </label>
            <label>
              Currency
              <input name="currency" defaultValue="GHS" maxLength={3} />
            </label>
          </div>
          <label>
            Requirements
            <textarea name="requirements" rows={4} maxLength={500} />
          </label>
        </fieldset>

        <div className={styles.actions}>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create booking"}
          </button>
          <Link className={styles.cancel} href={bookingCalendarHref}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
