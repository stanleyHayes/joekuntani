"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { DateField } from "../../ui/date-field";
import { Select } from "../../ui/select";
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
  }
  async function voidTicket(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await mutate(
      `/api/admin/ticket-ops/tickets/${String(data.get("ticket_id") ?? "")}/void`,
      { reason: String(data.get("reason") ?? "") },
    );
  }
  return (
    <section className={styles.workspace}>
      <header>
        <p>First-party ticketing</p>
        <h2>Orders, revenue and operations</h2>
      </header>
      <div className={styles.filters}>
        <label>
          Event ID
          <input value={eventID} onChange={(e) => setEventID(e.target.value)} />
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
        <button type="button" onClick={() => void load()}>
          Apply filters
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <div className={styles.summary}>
        {summaries.map((s, i) => (
          <article key={s.currency + i}>
            <h3>{s.currency}</h3>
            <p>{s.orders} orders</p>
            <strong>Net {s.net}</strong>
            <span>
              Revenue {s.revenue} · Fees {s.fees} · Refunds {s.refunded}
            </span>
          </article>
        ))}
      </div>
      <div className={styles.actions}>
        <a href={`/api/admin/ticket-ops/events/${eventID}/attendees.csv`}>
          Export attendee CSV
        </a>
        <button
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
      </div>
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
                  <button
                    type="button"
                    onClick={() =>
                      void mutate(`/api/admin/ticket-ops/orders/${id}/resend`)
                    }
                  >
                    Resend tickets
                  </button>
                  <form onSubmit={(e) => void refund(e, id)}>
                    <input
                      aria-label={`Refund amount for ${ref}`}
                      name="amount"
                      placeholder="0.00"
                      required
                    />
                    <input
                      aria-label={`Refund reason for ${ref}`}
                      name="reason"
                      required
                    />
                    <button>Approve refund</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
