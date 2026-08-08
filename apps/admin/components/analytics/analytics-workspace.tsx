"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import {
  AdminErrorState,
  AdminSkeleton,
  formatAdminTimestamp,
} from "../admin-feedback";
import { MetricWatermark } from "../metric-watermark";
import { SectionSwitcher } from "../section-switcher";
import styles from "./analytics-workspace.module.css";

type NamedCount = { name: string; count: number };
type AudienceMetric = {
  platform: string;
  metric_date: string;
  followers: number;
  reach: number;
  impressions: number;
};
type Overview = {
  generated_at: string;
  conversion_total: number;
  booking_submitted: number;
  ticket_purchases: number;
  pipeline: Record<string, number>;
  bookings_by_status: Record<string, number>;
  campaigns_by_status: Record<string, number>;
  content_published: number;
  top_sources: NamedCount[];
  top_paths: NamedCount[];
  audience: AudienceMetric[];
};

export function AnalyticsWorkspace() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/analytics/overview", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("denied");
        const body = (await response.json()) as Overview;
        if (!cancelled) {
          setOverview(body);
          setState("ready");
        }
      } catch {
        if (!cancelled) {
          setOverview(null);
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.workspace} aria-labelledby="analytics-heading">
      <SectionSwitcher section="governance" current="/analytics" />
      <header className={styles.header}>
        <p className={styles.eyebrow}>Dashboards</p>
        <h2 id="analytics-heading">Operations overview</h2>
        <p>
          Privacy-safe conversion totals and operational KPIs. Personal data
          never enters analytics payloads.
        </p>
      </header>

      {state === "loading" ? (
        <AdminSkeleton label="Loading analytics overview" variant="cards" />
      ) : null}
      {state === "error" ? (
        <AdminErrorState
          title="Analytics are unavailable"
          message="The overview could not be retrieved. Refresh the page or try again shortly."
        />
      ) : null}
      {state === "ready" && overview ? (
        <p className={styles.status} role="status" aria-live="polite">
          Updated {formatAdminTimestamp(overview.generated_at)}.
        </p>
      ) : null}

      {overview ? (
        <>
          <ul className={styles.kpis} aria-label="Overview KPIs">
            <li>
              <MetricWatermark variant="orbit" />
              <strong>{overview.conversion_total}</strong>
              <span>Conversions (30 days)</span>
            </li>
            <li>
              <MetricWatermark variant="wave" />
              <strong>{overview.booking_submitted}</strong>
              <span>Enquiries submitted</span>
            </li>
            <li>
              <MetricWatermark variant="spark" />
              <strong>{overview.ticket_purchases}</strong>
              <span>Ticket purchases</span>
            </li>
            <li>
              <MetricWatermark variant="grid" />
              <strong>{overview.content_published}</strong>
              <span>Published content</span>
            </li>
          </ul>

          <div className={styles.sectionLabel}>
            <span>02 / Operational breakdown</span>
            <p>
              Current distribution across the workflow, acquisition paths and
              publishing activity.
            </p>
          </div>

          <div className={styles.grid}>
            <MetricList
              title="Pipeline"
              empty="No enquiries have entered the pipeline."
              items={toItems(overview.pipeline)}
            />
            <MetricList
              title="Bookings"
              empty="No bookings recorded in this window."
              items={toItems(overview.bookings_by_status)}
            />
            <MetricList
              title="Campaigns"
              empty="No campaigns recorded in this window."
              items={toItems(overview.campaigns_by_status)}
            />
            <MetricList
              title="Top sources"
              empty="No referral sources measured yet."
              items={overview.top_sources.map((item) => ({
                name: item.name,
                count: item.count,
              }))}
            />
            <MetricList
              title="Top paths"
              empty="No page views measured yet."
              items={overview.top_paths.map((item) => ({
                name: item.name,
                count: item.count,
              }))}
            />
          </div>

          <section
            className={styles.audience}
            aria-labelledby="audience-heading"
          >
            <h3 id="audience-heading">Audience metrics</h3>
            {overview.audience.length === 0 ? (
              <EmptyState
                announce={false}
                tone="calendar"
                title="No approved audience metrics yet"
                description="Follower, reach and impression rows appear once a platform connector is approved and its first daily snapshot is recorded."
              />
            ) : (
              <table>
                <caption className={styles.caption}>Audience metrics</caption>
                <thead>
                  <tr>
                    <th scope="col">Platform</th>
                    <th scope="col">Date</th>
                    <th scope="col">Followers</th>
                    <th scope="col">Reach</th>
                    <th scope="col">Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.audience.map((row) => (
                    <tr key={`${row.platform}-${row.metric_date}`}>
                      <td>{row.platform}</td>
                      <td>{row.metric_date}</td>
                      <td>{row.followers}</td>
                      <td>{row.reach}</td>
                      <td>{row.impressions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function toItems(values: Record<string, number>) {
  return Object.entries(values).map(([name, count]) => ({ name, count }));
}

function MetricList({
  title,
  items,
  empty,
}: {
  title: string;
  items: NamedCount[];
  empty: string;
}) {
  const variant =
    title === "Pipeline"
      ? "wave"
      : title === "Bookings"
        ? "orbit"
        : title === "Campaigns"
          ? "spark"
          : "grid";
  return (
    <section className={styles.panel} aria-label={title}>
      <MetricWatermark variant={variant} />
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.blank}>{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.name}>
              <span>{item.name.replaceAll("_", " ")}</span>
              <strong>{item.count}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
