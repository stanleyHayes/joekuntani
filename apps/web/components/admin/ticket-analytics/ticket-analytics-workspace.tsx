"use client";

import { useEffect, useState } from "react";
import styles from "./ticket-analytics-workspace.module.css";

type Money = { currency: string; revenue: string; fees: string; refunded: string; net: string; orders: number };
type Settlement = { currency: string; recorded_net: string; provider_reported: string; variance: string; note: string };
type Inventory = { quantity_total: number; quantity_reserved: number; quantity_sold: number; quantity_available: number };
type Funnel = { selection_started: number; checkout_started: number; purchase_completed: number; purchase_failed: number; checked_in_events: number };
type Attendance = { valid: number; checked_in: number; void: number; refunded: number };
type EventRow = { event_id: string; title: string; checked_in: number; issued: number };
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

  return (
    <section className={styles.workspace} aria-labelledby="ticket-analytics-heading">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Ticketing</p>
        <h2 id="ticket-analytics-heading">Ticket analytics</h2>
        <p>Sales, inventory, conversion and attendance. Buyer personal data never appears in this dashboard.</p>
      </header>

      <p className={styles.status} role="status" aria-live="polite">
        {state === "loading" && "Loading ticket analytics…"}
        {state === "error" && "Ticket analytics are unavailable."}
        {state === "ready" && dashboard ? `Updated ${new Date(dashboard.generated_at).toUTCString()}.` : null}
      </p>

      {dashboard ? (
        <>
          <ul className={styles.kpis} aria-label="Attendance and inventory">
            <li><strong>{dashboard.attendance.checked_in}</strong><span>Checked in</span></li>
            <li><strong>{dashboard.attendance.valid}</strong><span>Still valid</span></li>
            <li><strong>{dashboard.inventory.quantity_sold}</strong><span>Sold</span></li>
            <li><strong>{dashboard.inventory.quantity_available}</strong><span>Available</span></li>
          </ul>

          <div className={styles.grid}>
            <MetricList
              title="Conversion funnel (30d)"
              items={[
                { name: "Selection started", count: dashboard.funnel.selection_started },
                { name: "Checkout started", count: dashboard.funnel.checkout_started },
                { name: "Purchase completed", count: dashboard.funnel.purchase_completed },
                { name: "Purchase failed", count: dashboard.funnel.purchase_failed },
                { name: "Check-in events", count: dashboard.funnel.checked_in_events },
              ]}
            />
            <MetricList
              title="Inventory"
              items={[
                { name: "Capacity", count: dashboard.inventory.quantity_total },
                { name: "Reserved", count: dashboard.inventory.quantity_reserved },
                { name: "Sold", count: dashboard.inventory.quantity_sold },
                { name: "Available", count: dashboard.inventory.quantity_available },
              ]}
            />
            <MetricList
              title="Ticket lifecycle"
              items={[
                { name: "Valid", count: dashboard.attendance.valid },
                { name: "Checked in", count: dashboard.attendance.checked_in },
                { name: "Void", count: dashboard.attendance.void },
                { name: "Refunded", count: dashboard.attendance.refunded },
              ]}
            />
          </div>

          {dashboard.financial && dashboard.sales && dashboard.sales.length > 0 ? (
            <section className={styles.money} aria-labelledby="sales-heading">
              <h3 id="sales-heading">Recorded sales vs settlement</h3>
              <table>
                <caption className={styles.caption}>Ticket sales by currency</caption>
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
                    const settlement = dashboard.settlement?.find((item) => item.currency === row.currency);
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
                Provider settlement feed is unavailable until ADR-004 is closed; reported values mirror recorded net.
              </p>
            </section>
          ) : (
            <p className={styles.note} role="status">
              Financial sales totals are visible only to roles with financial-record permission.
            </p>
          )}

          <section className={styles.money} aria-labelledby="events-heading">
            <h3 id="events-heading">Event attendance</h3>
            {dashboard.events.length === 0 ? (
              <p>No issued tickets are available yet.</p>
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

function MetricList({ title, items }: { title: string; items: { name: string; count: number }[] }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <h3>{title}</h3>
      {items.length === 0 ? <p>No data</p> : (
        <ul>
          {items.map((item) => (
            <li key={item.name}><span>{item.name}</span><strong>{item.count}</strong></li>
          ))}
        </ul>
      )}
    </section>
  );
}
