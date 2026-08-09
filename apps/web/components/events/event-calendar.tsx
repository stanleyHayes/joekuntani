import Link from "next/link";
import type { PublicEvent } from "./types";
import styles from "./event-calendar.module.css";

/**
 * A month-grid view of published dates.
 *
 * The events page is a list, which answers "what is coming up" but not "is he
 * free that weekend" — the question a promoter or a fan planning around a trip
 * actually has. A calendar answers it at a glance.
 */

export type CalendarDay = {
  /** Day of month, or null for the leading/trailing padding of a grid. */
  day: number | null;
  iso: string;
  events: PublicEvent[];
  isToday: boolean;
  isPast: boolean;
};

export type CalendarMonth = {
  key: string;
  label: string;
  weeks: CalendarDay[][];
  count: number;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Spelled out for assistive tech; the grid shows only the initial. */
const WEEKDAY_NAMES: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

/** Local-date key. Using the ISO instant would bucket a 9pm Accra show into the
    next day for any viewer east of it. */
function dayKey(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

/**
 * Builds one grid per month that contains at least one event.
 *
 * Empty months are skipped rather than rendered blank: a performer's calendar
 * is sparse, and twelve mostly-empty grids buries the dates that matter.
 * Weeks start Monday, which is the convention in Ghana and most of the world.
 */
export function buildCalendarMonths(
  events: readonly PublicEvent[],
  now: Date = new Date(),
): CalendarMonth[] {
  const byDay = new Map<string, PublicEvent[]>();
  for (const event of events) {
    const starts = new Date(event.starts_at);
    if (Number.isNaN(starts.getTime())) continue;
    const key = dayKey(starts);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }
  if (!byDay.size) return [];

  const todayKey = dayKey(now);
  const months = new Map<string, CalendarMonth>();

  for (const key of [...byDay.keys()].sort()) {
    const [year, month] = key.split("-").map(Number);
    const monthKey = `${year}-${`${month}`.padStart(2, "0")}`;
    if (months.has(monthKey)) continue;

    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    // getDay() is Sunday-first; shift so Monday is column 0.
    const lead = (first.getDay() + 6) % 7;

    const cells: CalendarDay[] = [];
    for (let index = 0; index < lead; index += 1) {
      cells.push({ day: null, iso: "", events: [], isToday: false, isPast: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = dayKey(new Date(year, month - 1, day));
      cells.push({
        day,
        iso,
        events: byDay.get(iso) ?? [],
        isToday: iso === todayKey,
        isPast: iso < todayKey,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, iso: "", events: [], isToday: false, isPast: false });
    }

    const weeks: CalendarDay[][] = [];
    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }

    months.set(monthKey, {
      key: monthKey,
      label: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      weeks,
      count: cells.reduce((total, cell) => total + cell.events.length, 0),
    });
  }

  return [...months.values()];
}

export function EventCalendar({
  events,
  now,
}: {
  events: readonly PublicEvent[];
  now?: Date;
}) {
  const months = buildCalendarMonths(events, now);
  if (!months.length) return null;

  return (
    <div className={styles.calendar}>
      {months.map((month) => (
        <section className={styles.month} key={month.key}>
          <h3 className={styles.monthLabel}>
            {month.label}
            <span>
              {month.count} {month.count === 1 ? "date" : "dates"}
            </span>
          </h3>
          {/* A real table: the grid is tabular data, and a screen reader user
              gets row and column context for free. */}
          <table className={styles.grid}>
            <caption className="sr-only">
              Events in {month.label}. Days without a date are empty.
            </caption>
            <thead>
              <tr>
                {WEEKDAYS.map((weekday) => (
                  // No `abbr`: it becomes the accessible name and would
                  // announce the column as "Mon", which is what the visible
                  // single letter plus the spelled-out label already handle.
                  <th key={weekday} scope="col">
                    <span aria-hidden="true">{weekday[0]}</span>
                    <span className="sr-only">{WEEKDAY_NAMES[weekday]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {month.weeks.map((week, index) => (
                <tr key={index}>
                  {week.map((cell, position) => (
                    <td
                      key={cell.iso || `pad-${position}`}
                      data-today={cell.isToday ? "true" : undefined}
                      data-past={cell.isPast ? "true" : undefined}
                      data-has-events={cell.events.length ? "true" : undefined}
                    >
                      {cell.day ? (
                        <>
                          <span className={styles.dayNumber}>{cell.day}</span>
                          {cell.events.map((event) => (
                            <Link
                              className={styles.event}
                              href={`/events/${event.slug}`}
                              key={event.id}
                              data-sold-out={
                                event.availability === "sold_out"
                                  ? "true"
                                  : undefined
                              }
                            >
                              {event.title}
                            </Link>
                          ))}
                        </>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
