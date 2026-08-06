"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DateField } from "../ui/date-field";
import { Select } from "../ui/select";
import styles from "./events.module.css";

type EventFiltersProps = {
  cities: string[];
  filters: {
    city?: string;
    date?: string;
    period?: string;
    availability?: string;
  };
  safeDate: string;
};

export function EventFilters({ cities, filters, safeDate }: EventFiltersProps) {
  const cityOptions = useMemo(
    () => [
      { value: "", label: "All cities" },
      ...cities.map((city) => ({ value: city, label: city })),
    ],
    [cities],
  );
  const [city, setCity] = useState(filters.city ?? "");
  const [date, setDate] = useState(safeDate);
  const [period, setPeriod] = useState(filters.period ?? "upcoming");
  const [availability, setAvailability] = useState(
    filters.availability ?? "all",
  );

  const activeCount = [
    city,
    date,
    period !== "upcoming" ? period : "",
    availability !== "all" ? availability : "",
  ].filter(Boolean).length;

  return (
    <form className={styles.filterBar} action="/events" method="get">
      <div className={styles.filterBarHead}>
        <p className={styles.filterBarTitle}>Refine events</p>
        {activeCount > 0 ? (
          <p className={styles.filterBarMeta} aria-live="polite">
            {activeCount} active
          </p>
        ) : (
          <p className={styles.filterBarMeta}>Show upcoming by default</p>
        )}
      </div>

      <div className={styles.filterFields}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>City</span>
          <Select
            name="city"
            aria-label="City"
            value={city}
            onChange={setCity}
            options={cityOptions}
            placeholder="All cities"
          />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Date</span>
          <DateField
            name="date"
            aria-label="Date"
            mode="date"
            value={date}
            onChange={setDate}
          />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>When</span>
          <Select
            name="period"
            aria-label="When"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "past", label: "Past" },
              { value: "all", label: "Any time" },
            ]}
          />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Availability</span>
          <Select
            name="availability"
            aria-label="Ticket availability"
            value={availability}
            onChange={setAvailability}
            options={[
              { value: "all", label: "Any availability" },
              { value: "on_sale", label: "On sale" },
              { value: "scheduled", label: "Scheduled" },
              { value: "paused", label: "Sales paused" },
              { value: "sold_out", label: "Sold out" },
              { value: "sale_ended", label: "Sales closed" },
            ]}
          />
        </label>
      </div>

      <div className={styles.filterActions}>
        <Link className={styles.filterClear} href="/events">
          Reset
        </Link>
        <button className={styles.filterApply} type="submit">
          Show events
        </button>
      </div>
    </form>
  );
}
