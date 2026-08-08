"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import {
  AdminErrorState,
  AdminSkeleton,
  formatAdminTimestamp,
} from "../admin-feedback";
import {
  MetricWatermark,
  type MetricWatermarkVariant,
} from "../metric-watermark";
import styles from "./ticket-analytics-workspace.module.css";

type Money = {
  currency: string;
  revenue: string;
  fees: string;
  refunded: string;
  net: string;
  orders: number;
};
type Settlement = {
  currency: string;
  recorded_net: string;
  provider_reported: string;
  variance: string;
  note: string;
};
type Inventory = {
  quantity_total: number;
  quantity_reserved: number;
  quantity_sold: number;
  quantity_available: number;
};
type Funnel = {
  selection_started: number;
  checkout_started: number;
  purchase_completed: number;
  purchase_failed: number;
  checked_in_events: number;
};
type Attendance = {
  valid: number;
  checked_in: number;
  void: number;
  refunded: number;
};
type EventRow = {
  event_id: string;
  title: string;
  checked_in: number;
  issued: number;
};
type Dashboard = {
  generated_at: string;
  financial: boolean;
  sales?: Money[];
  settlement?: Settlement[];
  inventory: Inventory;
  funnel: Funnel;
  attendance: Attendance;
  events: EventRow[];
};

const counter = new Intl.NumberFormat("en-US");

function formatCount(value: number) {
  return counter.format(value);
}

function share(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function formatShare(part: number, whole: number) {
  return `${Math.round(share(part, whole))}%`;
}

export function TicketAnalyticsWorkspace() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/ticket-analytics/dashboard", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("denied");
        const body = (await response.json()) as Dashboard;
        if (!cancelled) {
          setDashboard(body);
          setState("ready");
        }
      } catch {
        if (!cancelled) {
          setDashboard(null);
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lifecycleTotal = dashboard
    ? dashboard.attendance.valid +
      dashboard.attendance.checked_in +
      dashboard.attendance.void +
      dashboard.attendance.refunded
    : 0;

  return (
    <section
      className={styles.workspace}
      aria-labelledby="ticket-analytics-heading"
    >
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Ticketing</p>
          <h2 id="ticket-analytics-heading">Ticket analytics</h2>
          <p className="stage-head__lede">
            Sales, inventory, conversion & attendance. Buyer personal data never
            appears in this dashboard.
          </p>
        </div>
        {state === "ready" && dashboard ? (
          <div className="stage-head__actions">
            <p className={styles.status} role="status" aria-live="polite">
              Updated {formatAdminTimestamp(dashboard.generated_at)}.
            </p>
          </div>
        ) : null}
      </header>

      {state === "loading" ? (
        <AdminSkeleton label="Loading ticket analytics" variant="cards" />
      ) : null}
      {state === "error" ? (
        <AdminErrorState
          title="Ticket analytics are unavailable"
          message="Sales and attendance data could not be retrieved. Refresh the page or try again shortly."
        />
      ) : null}

      {dashboard ? (
        <>
          <ul className={styles.kpis} aria-label="Attendance and inventory">
            <li>
              <MetricWatermark variant="spark" />
              <strong>{formatCount(dashboard.attendance.checked_in)}</strong>
              <span>Checked in</span>
            </li>
            <li>
              <MetricWatermark variant="orbit" />
              <strong>{formatCount(dashboard.attendance.valid)}</strong>
              <span>Still valid</span>
            </li>
            <li>
              <MetricWatermark variant="wave" />
              <strong>{formatCount(dashboard.inventory.quantity_sold)}</strong>
              <span>Sold</span>
            </li>
            <li>
              <MetricWatermark variant="grid" />
              <strong>
                {formatCount(dashboard.inventory.quantity_available)}
              </strong>
              <span>Available</span>
            </li>
          </ul>

          <div className={styles.grid}>
            <FunnelFigure funnel={dashboard.funnel} />

            <StackedFigure
              title="Inventory"
              accent="k"
              watermark="grid"
              meta={
                dashboard.inventory.quantity_total > 0
                  ? `${formatShare(dashboard.inventory.quantity_sold, dashboard.inventory.quantity_total)} of capacity`
                  : undefined
              }
              headline={dashboard.inventory.quantity_sold}
              headlineLabel={`sold of ${formatCount(dashboard.inventory.quantity_total)} capacity`}
              total={dashboard.inventory.quantity_total}
              segments={[
                {
                  name: "Sold",
                  count: dashboard.inventory.quantity_sold,
                  seg: "j",
                },
                {
                  name: "Reserved",
                  count: dashboard.inventory.quantity_reserved,
                  seg: "k",
                },
                {
                  name: "Available",
                  count: dashboard.inventory.quantity_available,
                  seg: "track",
                },
              ]}
            />

            <StackedFigure
              title="Ticket lifecycle"
              accent="j"
              watermark="orbit"
              meta={
                lifecycleTotal > 0
                  ? `${formatShare(dashboard.attendance.checked_in, lifecycleTotal)} checked in`
                  : undefined
              }
              headline={lifecycleTotal}
              headlineLabel="tickets tracked"
              total={lifecycleTotal}
              segments={[
                { name: "Valid", count: dashboard.attendance.valid, seg: "j" },
                {
                  name: "Checked in",
                  count: dashboard.attendance.checked_in,
                  seg: "k",
                },
                {
                  name: "Void",
                  count: dashboard.attendance.void,
                  seg: "muted",
                },
                {
                  name: "Refunded",
                  count: dashboard.attendance.refunded,
                  seg: "faint",
                },
              ]}
            />
          </div>

          {dashboard.financial &&
          dashboard.sales &&
          dashboard.sales.length > 0 ? (
            <section className={styles.money} aria-labelledby="sales-heading">
              <h3 id="sales-heading">Recorded sales vs settlement</h3>
              <table>
                <caption className={styles.caption}>
                  Ticket sales by currency
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Currency</th>
                    <th scope="col">Revenue</th>
                    <th scope="col">Fees</th>
                    <th scope="col">Refunded</th>
                    <th scope="col">Net</th>
                    <th scope="col">Orders</th>
                    <th scope="col">Provider reported</th>
                    <th scope="col">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.sales.map((row) => {
                    const settlement = dashboard.settlement?.find(
                      (entry) => entry.currency === row.currency,
                    );
                    return (
                      <tr key={row.currency}>
                        <td>{row.currency}</td>
                        <td>{row.revenue}</td>
                        <td>{row.fees}</td>
                        <td>{row.refunded}</td>
                        <td>{row.net}</td>
                        <td>{row.orders}</td>
                        <td>{settlement?.provider_reported ?? "—"}</td>
                        <td>{settlement?.variance ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className={styles.note}>
                Provider settlement feed is unavailable until ADR-004 is closed;
                reported values mirror recorded net.
              </p>
            </section>
          ) : (
            <p className={styles.note} role="status">
              Financial sales totals are visible only to roles with
              financial-record permission.
            </p>
          )}

          <section className={styles.money} aria-labelledby="events-heading">
            <h3 id="events-heading">Event attendance</h3>
            {dashboard.events.length === 0 ? (
              <EmptyState
                announce={false}
                tone="calendar"
                title="No attendance activity yet"
                description="Issued and checked-in ticket totals will appear here after the first ticket sale."
              />
            ) : (
              <table>
                <caption className={styles.caption}>Event attendance</caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Checked in</th>
                    <th scope="col">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.events.map((row) => (
                    <tr key={row.event_id}>
                      <td>{row.title}</td>
                      <td>{row.checked_in}</td>
                      <td>{row.issued}</td>
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

/**
 * Conversion is a chain: selection -> checkout -> purchase. Each bar is scaled
 * against the entry stage so the drop-off reads as shape, not arithmetic.
 * Failures and check-ins sit outside that chain, so they stay as plain figures.
 */
function FunnelFigure({ funnel }: { funnel: Funnel }) {
  const title = "Conversion funnel (30 days)";
  const steps = [
    { name: "Selection started", count: funnel.selection_started },
    { name: "Checkout started", count: funnel.checkout_started },
    { name: "Purchase completed", count: funnel.purchase_completed },
  ];
  const outside = [
    { name: "Purchase failed", count: funnel.purchase_failed },
    { name: "Event check-ins", count: funnel.checked_in_events },
  ];
  const entry = steps[0].count;
  const empty =
    steps.every((step) => step.count === 0) &&
    outside.every((step) => step.count === 0);

  return (
    <section className={styles.figure} data-accent="j" aria-label={title}>
      <MetricWatermark variant="wave" />
      <div className={styles.figureHead}>
        <h3>{title}</h3>
        {entry > 0 ? (
          <p className={styles.figureMeta}>
            {formatShare(steps[2].count, entry)} converted
          </p>
        ) : null}
      </div>

      <ol className={styles.funnel}>
        {steps.map((step, index) => {
          const previous = index > 0 ? steps[index - 1] : null;
          const lost = previous ? previous.count - step.count : 0;
          return (
            <li className={styles.step} key={step.name}>
              {previous && !empty ? (
                <p className={styles.drop}>
                  <span aria-hidden="true">{lost > 0 ? "↓" : "→"}</span>
                  {lost > 0
                    ? `${formatCount(lost)} lost from ${previous.name.toLowerCase()}`
                    : `no drop-off from ${previous.name.toLowerCase()}`}
                </p>
              ) : null}
              <div className={styles.stepHead}>
                <span className={styles.micro}>{step.name}</span>
                <span className={styles.readout}>
                  <span className={styles.count}>
                    {formatCount(step.count)}
                  </span>
                  {entry > 0 ? (
                    <span className={styles.share}>
                      {formatShare(step.count, entry)}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className={styles.track} aria-hidden="true">
                {step.count > 0 ? (
                  <span
                    className={styles.fill}
                    style={{ width: `${share(step.count, entry)}%` }}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className={styles.outside}>
        {outside.map((step) => (
          <div className={styles.outsideCell} key={step.name}>
            <span className={styles.micro}>{step.name}</span>
            <span className={styles.count}>{formatCount(step.count)}</span>
          </div>
        ))}
      </div>

      {empty ? <p className={styles.zero}>No data yet</p> : null}
    </section>
  );
}

type MeterSegment = {
  name: string;
  count: number;
  /** `track` segments are the remainder — they read as the empty part of the bar. */
  seg: "j" | "k" | "muted" | "faint" | "track";
};

/** A part-to-whole figure: one stacked meter plus a legend carrying the numbers. */
function StackedFigure({
  title,
  accent,
  watermark,
  meta,
  headline,
  headlineLabel,
  total,
  segments,
}: {
  title: string;
  accent: "j" | "k";
  watermark: MetricWatermarkVariant;
  meta?: string;
  headline: number;
  headlineLabel: string;
  total: number;
  segments: MeterSegment[];
}) {
  const drawn = segments.filter((seg) => seg.seg !== "track" && seg.count > 0);
  const empty = total <= 0 && segments.every((seg) => seg.count === 0);

  return (
    <section className={styles.figure} data-accent={accent} aria-label={title}>
      <MetricWatermark variant={watermark} />
      <div className={styles.figureHead}>
        <h3>{title}</h3>
        {meta ? <p className={styles.figureMeta}>{meta}</p> : null}
      </div>

      <p className={styles.headline}>
        <strong className={styles.headlineValue}>
          {formatCount(headline)}
        </strong>
        <span className={styles.headlineLabel}>{headlineLabel}</span>
      </p>

      <div className={styles.meter} aria-hidden="true">
        {drawn.map((seg) => (
          <span
            className={styles.meterFill}
            data-seg={seg.seg}
            key={seg.name}
            style={{ width: `${share(seg.count, total)}%` }}
          />
        ))}
      </div>

      <ul className={styles.legend}>
        {segments.map((seg) => (
          <li key={seg.name}>
            <span
              aria-hidden="true"
              className={styles.swatch}
              data-seg={seg.seg}
            />
            <span className={`${styles.micro} ${styles.legendName}`}>
              {seg.name}
            </span>
            <span className={styles.readout}>
              <span className={styles.count}>{formatCount(seg.count)}</span>
              {total > 0 ? (
                <span className={styles.share}>
                  {formatShare(seg.count, total)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {empty ? <p className={styles.zero}>No data yet</p> : null}
    </section>
  );
}
