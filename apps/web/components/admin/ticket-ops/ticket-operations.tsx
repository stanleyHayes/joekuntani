"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { DateField } from "../../ui/date-field";
import { Select } from "../../ui/select";
import { AdminDialog } from "../admin-dialog";
import { EmptyState } from "../../ui/empty-state";
import { AdminErrorState } from "../admin-feedback";
import styles from "./ticket-operations.module.css";
type Order = {
  id: string;
  reference: string;
  event_id: string;
  buyer_email: string;
  currency: string;
  total: string;
  refunded: string;
  status: string;
};
type Summary = {
  currency: string;
  revenue: string;
  fees: string;
  refunded: string;
  net: string;
  orders: number;
};
export function TicketOperations() {
  const [items, setItems] = useState<Order[]>([]),
    [summaries, setSummaries] = useState<Summary[]>([]),
    [message, setMessage] = useState(""),
    [eventID, setEventID] = useState(""),
    [status, setStatus] = useState(""),
    [query, setQuery] = useState(""),
    [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState("");
  // Distinguishes "nothing sold yet" from "your filters excluded everything" —
  // the two need different copy and a different next action.
  const filtered = Boolean(
    eventID.trim() || status || query.trim() || dateFrom || dateTo,
  );
  const [voidOpen, setVoidOpen] = useState(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (eventID) p.set("event_id", eventID);
    if (status) p.set("status", status);
    if (query) p.set("q", query);
    if (dateFrom) p.set("date_from", dateFrom);
    if (dateTo) p.set("date_to", dateTo);
    try {
      const d = await request(`/api/admin/ticket-ops/orders?${p}`);
      setItems(d.items ?? []);
      setSummaries(d.summary ?? []);
    } catch {
      setMessage("Ticket operations are unavailable.");
    }
  }, [eventID, status, query, dateFrom, dateTo]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function mutate(path: string, body?: unknown, headers?: HeadersInit) {
    try {
      await request(path, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
        headers,
      });
      setMessage("Ticket operation accepted and audited.");
      await load();
    } catch {
      setMessage("Ticket operation was rejected.");
    }
  }
  async function refund(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await mutate(
      `/api/admin/ticket-ops/orders/${id}/refund`,
      { amount: String(d.get("amount")), reason: String(d.get("reason")) },
      { "Idempotency-Key": crypto.randomUUID() + crypto.randomUUID() },
    );
    setRefundOrder(null);
  }
  async function voidTicket(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await mutate(
      `/api/admin/ticket-ops/tickets/${String(data.get("ticket_id") ?? "")}/void`,
      { reason: String(data.get("reason") ?? "") },
    );
    setVoidOpen(false);
  }
  return (
    <section className={styles.workspace}>
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">First-party ticketing</p>
          <h2>Orders, revenue and operations</h2>
          <p className="stage-head__lede">
            Search paid orders, reconcile revenue and run refunds, resends and
            voids. Every action is audited.
          </p>
        </div>
      </header>
      <div className="stage-filters">
        <div className="stage-filters__head">
          <p className="stage-filters__title">Refine</p>
          <p className="stage-filters__meta">
            {items.length} {items.length === 1 ? "order" : "orders"}
          </p>
        </div>
        <div className="stage-filters__fields">
          <label>
            Event ID
            <input
              value={eventID}
              onChange={(e) => setEventID(e.target.value)}
            />
          </label>
          <label>
            Status
            <Select
              value={status}
              onChange={setStatus}
              placeholder="All"
              options={[
                { value: "paid", label: "paid" },
                { value: "payment_failed", label: "payment_failed" },
                { value: "cancelled", label: "cancelled" },
                { value: "partially_refunded", label: "partially_refunded" },
                { value: "refunded", label: "refunded" },
              ]}
              aria-label="Order status filter"
            />
          </label>
          <label>
            Buyer or reference
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            From
            <DateField
              aria-label="From date"
              mode="date"
              value={dateFrom}
              onChange={setDateFrom}
            />
          </label>
          <label>
            To
            <DateField
              aria-label="To date"
              mode="date"
              value={dateTo}
              onChange={setDateTo}
            />
          </label>
        </div>
        <div className="stage-filters__actions">
          <button className="primary" type="button" onClick={() => void load()}>
            Apply filters
          </button>
        </div>
      </div>
      {message === "Ticket operations are unavailable." ? (
        <AdminErrorState
          title="Ticket operations are unavailable"
          message={message}
        />
      ) : message ? (
        <p role="status">{message}</p>
      ) : null}
      {summaries.length ? (
        <div className={styles.summary}>
          {summaries.map((s, i) => (
            <article key={s.currency + i}>
              <p className={styles.summaryCurrency}>{s.currency} net</p>
              <strong className={styles.summaryNet}>{s.net}</strong>
              <p className={styles.summaryOrders}>
                across {s.orders} {s.orders === 1 ? "order" : "orders"}
              </p>
              <dl className={styles.summaryBreakdown}>
                <div>
                  <dt>Revenue</dt>
                  <dd>{s.revenue}</dd>
                </div>
                <div>
                  <dt>Fees</dt>
                  <dd>{s.fees}</dd>
                </div>
                <div>
                  <dt>Refunds</dt>
                  <dd>{s.refunded}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}
      <div className={styles.opsBar}>
        <p className={styles.opsLabel}>Event operations</p>
        <a href={`/api/admin/ticket-ops/events/${eventID}/attendees.csv`}>
          Export attendee CSV
        </a>
        <button
          className={styles.danger}
          type="button"
          onClick={() => {
            const reason = prompt("Cancellation reason");
            if (
              reason &&
              confirm("Cancel this event and queue customer guidance?")
            )
              void mutate(`/api/admin/ticket-ops/events/${eventID}/cancel`, {
                reason,
              });
          }}
        >
          Cancel event
        </button>
        <button
          className={styles.danger}
          type="button"
          onClick={() => setVoidOpen(true)}
        >
          Void ticket
        </button>
      </div>
      {voidOpen ? (
        <AdminDialog
          title="Void ticket"
          description="Invalidate one issued ticket and retain the audit reason."
          onClose={() => setVoidOpen(false)}
        >
          <form className={styles.actions} onSubmit={voidTicket}>
            <label>
              Ticket ID
              <input name="ticket_id" required />
            </label>
            <label>
              Void reason
              <input name="reason" required minLength={3} />
            </label>
            <button type="submit">Void ticket</button>
          </form>
        </AdminDialog>
      ) : null}
      {items.length === 0 ? (
        filtered ? (
          <EmptyState
            announce={false}
            tone="search"
            title="No orders match these filters"
            description="Widen the date range, clear the status, or check the event ID and buyer reference."
          />
        ) : (
          <EmptyState
            announce={false}
            tone="inbox"
            title="No orders yet"
            description="Paid orders appear here as soon as tickets sell. Publish an event with ticket types to start taking payments."
          />
        )
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Buyer</th>
              <th>Financials</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => {
              const id = o.id,
                ref = o.reference;
              return (
                <tr key={id}>
                  <td>
                    <strong>{ref}</strong>
                    <br />
                    {o.status}
                  </td>
                  <td>{o.buyer_email}</td>
                  <td>
                    {o.currency} {o.total}
                    <br />
                    Refunded {o.refunded}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        onClick={() =>
                          void mutate(
                            `/api/admin/ticket-ops/orders/${id}/resend`,
                          )
                        }
                      >
                        Resend tickets
                      </button>
                      <button type="button" onClick={() => setRefundOrder(o)}>
                        Refund order
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {refundOrder ? (
        <AdminDialog
          title={`Refund ${refundOrder.reference}`}
          description="Enter the approved amount and audit reason."
          onClose={() => setRefundOrder(null)}
        >
          <form onSubmit={(event) => void refund(event, refundOrder.id)}>
            <input
              aria-label={`Refund amount for ${refundOrder.reference}`}
              name="amount"
              placeholder="0.00"
              required
            />
            <input
              aria-label={`Refund reason for ${refundOrder.reference}`}
              name="reason"
              required
            />
            <button>Approve refund</button>
          </form>
        </AdminDialog>
      ) : null}
    </section>
  );
}
async function request(path: string, init: RequestInit = {}) {
  const token =
    document.cookie
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("jk_admin_csrf="))
      ?.split("=")[1] ?? "";
  const r = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.method ? { "X-CSRF-Token": token } : {}),
      ...init.headers,
    },
  });
  if (!r.ok) throw new Error("request failed");
  return r.status === 204 ? {} : r.json();
}
