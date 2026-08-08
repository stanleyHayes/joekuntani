"use client";

import { useEffect, useState } from "react";
import { AdminSkeleton } from "../admin-feedback";
import {
  MetricWatermark,
  type MetricWatermarkVariant,
} from "../metric-watermark";
import styles from "./overview-charts.module.css";

type NamedCount = { name: string; count: number };
type AudienceMetric = {
  platform: string;
  metric_date: string;
  followers: number;
};
type AnalyticsOverview = {
  conversion_total: number;
  booking_submitted: number;
  ticket_purchases: number;
  content_published: number;
  pipeline: Record<string, number>;
  bookings_by_status: Record<string, number>;
  top_sources: NamedCount[];
  top_paths: NamedCount[];
  audience: AudienceMetric[];
};
type TicketDashboard = {
  inventory: {
    quantity_total: number;
    quantity_reserved: number;
    quantity_sold: number;
    quantity_available: number;
  };
};

export function OverviewCharts() {
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [tickets, setTickets] = useState<TicketDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    void (async () => {
      // Each panel degrades on its own — a missing ticket dashboard should not
      // blank the pipeline chart, so the two requests settle independently.
      const [analyticsResult, ticketResult] = await Promise.allSettled([
        fetchJSON<AnalyticsOverview>("/api/admin/analytics/overview"),
        fetchJSON<TicketDashboard>("/api/admin/ticket-analytics/dashboard"),
      ]);
      if (!current) return;
      if (analyticsResult.status === "fulfilled")
        setAnalytics(analyticsResult.value);
      if (ticketResult.status === "fulfilled") setTickets(ticketResult.value);
      setLoading(false);
    })();
    return () => {
      current = false;
    };
  }, []);

  if (loading)
    return <AdminSkeleton label="Loading overview metrics" variant="table" />;

  const inventory = tickets?.inventory;
  const capacity = inventory?.quantity_total ?? 0;

  return (
    <div className={styles.viz}>
      <div className={styles.kpis}>
        <Kpi
          label="Enquiries"
          value={analytics?.conversion_total ?? 0}
          sub="Conversions recorded across the site"
          watermark="spark"
        />
        <Kpi
          label="Bookings"
          value={analytics?.booking_submitted ?? 0}
          sub="Booking requests submitted"
          watermark="wave"
        />
        {/* Sourced from the ticketing ledger, not analytics.ticket_purchases.
            The analytics counter only increments on a client-side event fired
            from the public site, so orders completed through the Paystack
            webhook never reach it — this KPI read 0 while the Ticket inventory
            block directly below it reported 2 sold, from the same page. The
            ledger is the record money is reconciled against, so it wins. */}
        <Kpi
          label="Tickets sold"
          value={inventory?.quantity_sold ?? 0}
          sub="Completed ticket purchases"
          watermark="grid"
        />
        <Kpi
          label="Published"
          value={analytics?.content_published ?? 0}
          sub="Live content pieces"
          watermark="orbit"
        />
      </div>

      <div className={styles.charts}>
        <ConversionFlow
          enquiries={analytics?.conversion_total ?? 0}
          bookings={analytics?.booking_submitted ?? 0}
          tickets={inventory?.quantity_sold ?? 0}
        />
        <SourceMix data={analytics?.top_sources ?? []} />
        <BarBlock
          title="Enquiry pipeline"
          meta="by stage"
          data={toCounts(analytics?.pipeline)}
          empty="No enquiries have entered the pipeline yet."
          watermark="wave"
        />
        <BarBlock
          title="Bookings"
          meta="by status"
          data={toCounts(analytics?.bookings_by_status)}
          empty="No bookings recorded yet."
          watermark="orbit"
        />
        <BarBlock
          title="Top sources"
          meta="where visitors arrive from"
          data={analytics?.top_sources ?? []}
          empty="No referral sources measured yet."
          watermark="spark"
        />
        <BarBlock
          title="Top pages"
          meta="most visited"
          data={analytics?.top_paths ?? []}
          empty="No page views measured yet."
          watermark="grid"
        />

        <section className={styles.block} aria-labelledby="overview-inventory">
          <MetricWatermark variant="grid" motion="still" />
          <div className={styles.blockHead}>
            <h3 className={styles.blockTitle} id="overview-inventory">
              Ticket inventory
            </h3>
            <p className={styles.blockMeta}>
              {capacity ? `${capacity} capacity` : "no capacity"}
            </p>
          </div>
          {capacity > 0 && inventory ? (
            <>
              <div
                className={styles.meter}
                role="img"
                aria-label={`Of ${capacity} tickets, ${inventory.quantity_sold} sold, ${inventory.quantity_reserved} reserved, ${inventory.quantity_available} available.`}
              >
                <span
                  className={styles.meterSegment}
                  data-series="1"
                  style={{
                    width: `${percent(inventory.quantity_sold, capacity)}%`,
                  }}
                />
                <span
                  className={styles.meterSegment}
                  data-series="2"
                  style={{
                    width: `${percent(inventory.quantity_reserved, capacity)}%`,
                  }}
                />
              </div>
              {/* Values are in the legend, so identity never rests on colour. */}
              <ul className={styles.legend}>
                <LegendEntry
                  series="1"
                  label="Sold"
                  value={inventory.quantity_sold}
                />
                <LegendEntry
                  series="2"
                  label="Reserved"
                  value={inventory.quantity_reserved}
                />
                <LegendEntry
                  series="track"
                  label="Available"
                  value={inventory.quantity_available}
                />
              </ul>
            </>
          ) : (
            <p className={styles.blank}>
              Publish an event with ticket types to track inventory here.
            </p>
          )}
        </section>

        <AudienceBlock metrics={analytics?.audience ?? []} />
      </div>
    </div>
  );
}

function ConversionFlow({
  enquiries,
  bookings,
  tickets,
}: {
  enquiries: number;
  bookings: number;
  tickets: number;
}) {
  const stages = [
    { label: "Enquiries", value: enquiries },
    { label: "Bookings", value: bookings },
    { label: "Tickets", value: tickets },
  ];
  const peak = Math.max(...stages.map((stage) => stage.value), 1);
  return (
    <section
      className={`${styles.block} ${styles.flowBlock}`}
      aria-labelledby="overview-conversion-flow"
    >
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle} id="overview-conversion-flow">
          Conversion flow
        </h3>
        <p className={styles.blockMeta}>site intent to attendance</p>
      </div>
      <ol className={styles.funnel}>
        {stages.map((stage, index) => (
          <li
            key={stage.label}
            style={{
              ["--stage-scale" as string]: Math.max(stage.value / peak, 0.18),
            }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage.value.toLocaleString()}</strong>
            <small>{stage.label}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SourceMix({ data }: { data: NamedCount[] }) {
  const ranked = [...data]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const total = ranked.reduce((sum, item) => sum + item.count, 0);
  const stops = ranked.map((item, index) => {
    const start =
      (ranked.slice(0, index).reduce((sum, entry) => sum + entry.count, 0) /
        Math.max(total, 1)) *
      100;
    const end = start + (item.count / Math.max(total, 1)) * 100;
    return `var(--ring-${index + 1}) ${start}% ${end}%`;
  });
  return (
    <section
      className={`${styles.block} ${styles.mixBlock}`}
      aria-labelledby="overview-source-mix"
    >
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle} id="overview-source-mix">
          Source mix
        </h3>
        <p className={styles.blockMeta}>share of measured arrivals</p>
      </div>
      {total ? (
        <div className={styles.mixBody}>
          <div
            className={styles.donut}
            style={{ background: `conic-gradient(${stops.join(", ")})` }}
            role="img"
            aria-label={`${total} measured arrivals across ${ranked.length} sources`}
          >
            <span>
              <strong>{total.toLocaleString()}</strong>
              <small>arrivals</small>
            </span>
          </div>
          <ol className={styles.mixLegend}>
            {ranked.map((item, index) => (
              <li key={item.name}>
                <i data-ring={index + 1} />
                <span>{humanize(item.name)}</span>
                <strong>{Math.round((item.count / total) * 100)}%</strong>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className={styles.blank}>No referral sources measured yet.</p>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  watermark,
}: {
  label: string;
  value: number;
  sub: string;
  watermark: MetricWatermarkVariant;
}) {
  return (
    <article className={styles.kpi}>
      <MetricWatermark variant={watermark} />
      <p className={styles.kpiLabel}>{label}</p>
      <strong className={styles.kpiValue}>{value.toLocaleString()}</strong>
      <p className={styles.kpiSub}>{sub}</p>
    </article>
  );
}

function BarBlock({
  title,
  meta,
  data,
  empty,
  watermark,
}: {
  title: string;
  meta: string;
  data: NamedCount[];
  empty: string;
  watermark: MetricWatermarkVariant;
}) {
  const id = `overview-${title.toLowerCase().replaceAll(" ", "-")}`;
  const ranked = [...data].sort((a, b) => b.count - a.count).slice(0, 6);
  const peak = Math.max(...ranked.map((entry) => entry.count), 0);

  return (
    <section className={styles.block} aria-labelledby={id}>
      <MetricWatermark variant={watermark} motion="still" />
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle} id={id}>
          {title}
        </h3>
        <p className={styles.blockMeta}>{meta}</p>
      </div>
      {ranked.length && peak > 0 ? (
        <dl className={styles.bars}>
          {ranked.map((entry) => (
            <div className={styles.bar} key={entry.name}>
              <dt className={styles.barLabel}>{humanize(entry.name)}</dt>
              <span className={styles.barTrack} aria-hidden="true">
                <span
                  className={styles.barFill}
                  style={{ ["--fill" as string]: `${entry.count / peak}` }}
                />
              </span>
              <dd className={styles.barValue}>{entry.count}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.blank}>{empty}</p>
      )}
    </section>
  );
}

function AudienceBlock({ metrics }: { metrics: AudienceMetric[] }) {
  // One platform, ordered by date — a trend, so a line rather than bars.
  const series = [...metrics]
    .filter((entry) => Number.isFinite(entry.followers))
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
    .slice(-24);
  const latest = series.at(-1);

  return (
    <section className={styles.block} aria-labelledby="overview-audience">
      <MetricWatermark variant="wave" motion="still" />
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle} id="overview-audience">
          Audience
        </h3>
        <p className={styles.blockMeta}>
          {latest ? `${latest.platform} · followers` : "followers"}
        </p>
      </div>
      {series.length >= 2 ? (
        <>
          <Sparkline values={series.map((entry) => entry.followers)} />
          <p className={styles.blockMeta}>
            {latest?.followers.toLocaleString()} as of {latest?.metric_date}
          </p>
        </>
      ) : (
        <p className={styles.blank}>
          No approved audience metrics yet. Import them to chart follower
          growth.
        </p>
      )}
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 100;
  const height = 32;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: height - ((value - low) / span) * height,
  }));
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
  const last = points.at(-1);

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Follower trend from ${low.toLocaleString()} to ${high.toLocaleString()}.`}
    >
      <path
        className={styles.sparkLine}
        d={path}
        vectorEffect="non-scaling-stroke"
      />
      {last ? (
        <circle className={styles.sparkDot} cx={last.x} cy={last.y} r="2" />
      ) : null}
    </svg>
  );
}

function LegendEntry({
  series,
  label,
  value,
}: {
  series: string;
  label: string;
  value: number;
}) {
  return (
    <li className={styles.legendEntry}>
      <span className={styles.swatch} data-series={series} aria-hidden="true" />
      {label}
      <span className={styles.legendValue}>{value.toLocaleString()}</span>
    </li>
  );
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
}

function toCounts(source: Record<string, number> | undefined): NamedCount[] {
  return Object.entries(source ?? {}).map(([name, count]) => ({ name, count }));
}

function percent(value: number, total: number) {
  return total > 0 ? Math.min(100, (value / total) * 100) : 0;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}
