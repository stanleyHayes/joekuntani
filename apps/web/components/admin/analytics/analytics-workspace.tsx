"use client";

import { useEffect, useState } from "react";
import styles from "./analytics-workspace.module.css";

type NamedCount = { name: string; count: number };
type AudienceMetric = { platform: string; metric_date: string; followers: number; reach: number; impressions: number };
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
      <header className={styles.header}>
        <p className={styles.eyebrow}>Dashboards</p>
        <h2 id="analytics-heading">Operations overview</h2>
        <p>Privacy-safe conversion totals and operational KPIs. Personal data never enters analytics payloads.</p>
      </header>

      <p className={styles.status} role="status" aria-live="polite">
        {state === "loading" && "Loading analytics overview…"}
        {state === "error" && "Analytics are unavailable."}
        {state === "ready" && overview ? `Updated ${new Date(overview.generated_at).toUTCString()}.` : null}
      </p>

      {overview ? (
        <>
          <ul className={styles.kpis} aria-label="Overview KPIs">
            <li><strong>{overview.conversion_total}</strong><span>Conversions (30d)</span></li>
            <li><strong>{overview.booking_submitted}</strong><span>Enquiries submitted</span></li>
            <li><strong>{overview.ticket_purchases}</strong><span>Ticket purchases</span></li>
            <li><strong>{overview.content_published}</strong><span>Published content</span></li>
          </ul>

          <div className={styles.grid}>
            <MetricList title="Pipeline" items={toItems(overview.pipeline)} />
            <MetricList title="Bookings" items={toItems(overview.bookings_by_status)} />
            <MetricList title="Campaigns" items={toItems(overview.campaigns_by_status)} />
            <MetricList title="Top sources" items={overview.top_sources.map((item) => ({ name: item.name, count: item.count }))} />
            <MetricList title="Top paths" items={overview.top_paths.map((item) => ({ name: item.name, count: item.count }))} />
          </div>

          <section className={styles.audience} aria-labelledby="audience-heading">
            <h3 id="audience-heading">Audience metrics</h3>
            {overview.audience.length === 0 ? <p>No approved audience metrics are available yet.</p> : (
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

function MetricList({ title, items }: { title: string; items: NamedCount[] }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <h3>{title}</h3>
      {items.length === 0 ? <p>No data yet.</p> : (
        <ul>
          {items.map((item) => (
            <li key={item.name}><span>{item.name.replaceAll("_", " ")}</span><strong>{item.count}</strong></li>
          ))}
        </ul>
      )}
    </section>
  );
}
