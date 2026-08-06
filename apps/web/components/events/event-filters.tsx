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

  return (
    <form className={styles.filters} action="/events" method="get">
      <label className={styles.filter}>
        City
        <Select
          name="city"
          aria-label="City"
          value={city}
          onChange={setCity}
          options={cityOptions}
          placeholder="All cities"
        />
      </label>
      <label className={styles.filter}>
        Date
        <DateField
          name="date"
          aria-label="Date"
          mode="date"
          value={date}
          onChange={setDate}
        />
      </label>
      <label className={styles.filter}>
        Time
        <Select
          name="period"
          aria-label="Time period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
            { value: "all", label: "All dates" },
          ]}
        />
      </label>
      <label className={styles.filter}>
        Tickets
        <Select
          name="availability"
          aria-label="Ticket availability"
          value={availability}
          onChange={setAvailability}
          options={[
            { value: "all", label: "All states" },
            { value: "on_sale", label: "On sale" },
            { value: "scheduled", label: "Scheduled" },
            { value: "paused", label: "Sales paused" },
            { value: "sold_out", label: "Sold out" },
            { value: "sale_ended", label: "Sales closed" },
          ]}
        />
      </label>
      <div className={styles.actions}>
        <button type="submit">Apply filters</button>
        <Link href="/events">Clear filters</Link>
      </div>
    </form>
  );
}
