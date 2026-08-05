"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import styles from "./event-manager.module.css";

type Status = "draft" | "published" | "cancelled";
type EventRecord = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: number;
  status: Status;
  banner_asset_id?: string;
  banner: { featured: boolean; starts_at?: string; ends_at?: string };
  venue: {
    name: string;
    address: string;
    city: string;
    country_code: string;
    map_url?: string;
    accessibility?: string;
  };
  policies: {
    refunds: string;
    entry: string;
    age_limit: number;
    age_guidance?: string;
    accessibility?: string;
  };
};
type Ticket = {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  capacity: number;
  sold: number;
  reserved: number;
  min_per_order: number;
  max_per_order: number;
  sales_start: string;
  sales_end: string;
  paused: boolean;
  status: string;
  sort_order: number;
};
type EventDraft = Omit<EventRecord, "id" | "slug" | "status">;

const emptyEvent: EventDraft = {
  title: "",
  summary: "",
  description: "",
  starts_at: "",
  ends_at: "",
  timezone: "Africa/Accra",
  capacity: 1,
  banner_asset_id: "",
  banner: { featured: false },
  venue: { name: "", address: "", city: "", country_code: "GH" },
  policies: { refunds: "", entry: "", age_limit: 0 },
};
const emptyTicket = {
  name: "",
  description: "",
  price: "",
  currency: "GHS",
  capacity: 1,
  min_per_order: 1,
  max_per_order: 1,
  sales_start: "",
  sales_end: "",
  sort_order: 0,
};

export function EventManager() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [draft, setDraft] = useState<EventDraft>(emptyEvent);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketDraft, setTicketDraft] = useState(emptyTicket);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/events", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) throw new Error();
        const result = (await response.json()) as { items: EventRecord[] };
        setEvents(result.items ?? []);
      } catch {
        setError("Events could not be loaded. Try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function choose(item: EventRecord) {
    setSelected(item);
    setDraft(stripEvent(item));
    setMessage("");
    setError("");
    setSelectedTicket(null);
    setTicketDraft(emptyTicket);
    try {
      const response = await fetch(`/api/admin/events/${item.id}/preview`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as { tickets: Ticket[] };
      setTickets(result.tickets ?? []);
    } catch {
      setTickets([]);
      setError("The protected preview could not be loaded.");
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        selected ? `/api/admin/events/${selected.id}` : "/api/admin/events",
        {
          method: selected ? "PUT" : "POST",
          credentials: "include",
          headers: mutationHeaders(),
          body: JSON.stringify(draft),
        },
      );
      if (!response.ok) throw new Error();
      const saved = (await response.json()) as EventRecord;
      setEvents((current) => [
        ...current.filter((item) => item.id !== saved.id),
        saved,
      ]);
      setSelected(saved);
      setDraft(stripEvent(saved));
      setMessage("Event draft saved and audited.");
    } catch {
      setError(
        "The event was not accepted. Review dates, policies and capacity.",
      );
    } finally {
      setPending(false);
    }
  }

  async function transition(action: "publish" | "cancel") {
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/events/${selected.id}/${action}`,
        { method: "POST", credentials: "include", headers: mutationHeaders() },
      );
      if (!response.ok) throw new Error();
      const updated = (await response.json()) as EventRecord;
      setSelected(updated);
      setEvents((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(
        action === "publish" ? "Event published." : "Event cancelled.",
      );
    } catch {
      setError(
        action === "publish"
          ? "Publish failed. Add valid ticket types and check capacity and dates."
          : "Only a published event can be cancelled.",
      );
    } finally {
      setPending(false);
    }
  }

  async function addTicket(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        selectedTicket
          ? `/api/admin/events/${selected.id}/tickets/${selectedTicket.id}`
          : `/api/admin/events/${selected.id}/tickets`,
        {
          method: selectedTicket ? "PUT" : "POST",
          credentials: "include",
          headers: mutationHeaders(),
          body: JSON.stringify(ticketDraft),
        },
      );
      if (!response.ok) throw new Error();
      const saved = (await response.json()) as Ticket;
      setTickets((current) =>
        selectedTicket
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
      );
      setTicketDraft({ ...emptyTicket, sort_order: tickets.length + 1 });
      setSelectedTicket(null);
      setMessage(
        selectedTicket
          ? "Ticket type updated and audited."
          : "Ticket type added and audited.",
      );
    } catch {
      setError(
        "Ticket type was rejected. Check price, sales window and limits.",
      );
    } finally {
      setPending(false);
    }
  }

  async function pause(ticket: Ticket) {
    if (!selected) return;
    setPending(true);
    try {
      const response = await fetch(
        `/api/admin/events/${selected.id}/tickets/${ticket.id}/${ticket.paused ? "resume" : "pause"}`,
        { method: "POST", credentials: "include", headers: mutationHeaders() },
      );
      if (!response.ok) throw new Error();
      const updated = (await response.json()) as Ticket;
      setTickets((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(
        updated.paused ? "Ticket sales paused." : "Ticket sales resumed.",
      );
    } catch {
      setError("Ticket sales state could not be changed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.manager}>
      <section className={styles.panel} aria-labelledby="events-title">
        <h2 id="events-title">Events</h2>
        <p>
          Drafts remain private until an authorized publish action succeeds.
        </p>
        <button
          disabled={pending}
          onClick={() => {
            setSelected(null);
            setDraft(emptyEvent);
            setTickets([]);
            setSelectedTicket(null);
            setTicketDraft(emptyTicket);
          }}
          type="button"
        >
          Add event
        </button>
        {loading ? (
          <p role="status">Loading events…</p>
        ) : events.length === 0 ? (
          <p>No approved event content exists yet.</p>
        ) : (
          <ul className={styles.list}>
            {events.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.status}</span>
                <button onClick={() => void choose(item)} type="button">
                  Edit and preview {item.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="event-editor-title">
        <h2 id="event-editor-title">{selected ? "Edit event" : "New event"}</h2>
        <form className={styles.form} onSubmit={(event) => void save(event)}>
          <Field label="Title">
            <input
              maxLength={160}
              required
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </Field>
          <Field label="Summary">
            <textarea
              maxLength={320}
              value={draft.summary}
              onChange={(event) =>
                setDraft({ ...draft, summary: event.target.value })
              }
            />
          </Field>
          <Field label="Description">
            <textarea
              maxLength={20000}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </Field>
          <div className={styles.grid}>
            <Field label="Starts at">
              <input
                maxLength={120}
                required
                type="datetime-local"
                value={localDate(draft.starts_at)}
                onChange={(event) =>
                  setDraft({ ...draft, starts_at: isoDate(event.target.value) })
                }
              />
            </Field>
            <Field label="Ends at">
              <input
                maxLength={200}
                required
                type="datetime-local"
                value={localDate(draft.ends_at)}
                onChange={(event) =>
                  setDraft({ ...draft, ends_at: isoDate(event.target.value) })
                }
              />
            </Field>
            <Field label="Timezone">
              <input
                maxLength={500}
                required
                value={draft.timezone}
                onChange={(event) =>
                  setDraft({ ...draft, timezone: event.target.value })
                }
              />
            </Field>
            <Field label="Capacity">
              <input
                maxLength={120}
                min={1}
                required
                type="number"
                value={draft.capacity}
                onChange={(event) =>
                  setDraft({ ...draft, capacity: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Venue">
              <input
                required
                value={draft.venue.name}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    venue: { ...draft.venue, name: event.target.value },
                  })
                }
              />
            </Field>
            <Field label="Address">
              <input
                required
                value={draft.venue.address}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    venue: { ...draft.venue, address: event.target.value },
                  })
                }
              />
            </Field>
            <Field label="City">
              <input
                required
                value={draft.venue.city}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    venue: { ...draft.venue, city: event.target.value },
                  })
                }
              />
            </Field>
            <Field label="Country code">
              <input
                aria-describedby="country-code-help"
                maxLength={2}
                pattern="[A-Za-z]{2}"
                required
                value={draft.venue.country_code}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    venue: {
                      ...draft.venue,
                      country_code: event.target.value.toUpperCase(),
                    },
                  })
                }
              />
              <small id="country-code-help">Two-letter ISO country code.</small>
            </Field>
            <Field label="Map URL">
              <input
                maxLength={2048}
                pattern="https://.*"
                type="url"
                value={draft.venue.map_url ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    venue: { ...draft.venue, map_url: event.target.value },
                  })
                }
              />
            </Field>
          </div>
          <Field label="Venue accessibility">
            <textarea
              maxLength={2000}
              value={draft.venue.accessibility ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  venue: { ...draft.venue, accessibility: event.target.value },
                })
              }
            />
          </Field>
          <Field label="Refund policy">
            <textarea
              maxLength={5000}
              required
              value={draft.policies.refunds}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  policies: { ...draft.policies, refunds: event.target.value },
                })
              }
            />
          </Field>
          <Field label="Entry policy">
            <textarea
              maxLength={5000}
              required
              value={draft.policies.entry}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  policies: { ...draft.policies, entry: event.target.value },
                })
              }
            />
          </Field>
          <Field label="Age guidance">
            <textarea
              maxLength={1000}
              value={draft.policies.age_guidance ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  policies: {
                    ...draft.policies,
                    age_guidance: event.target.value,
                  },
                })
              }
            />
          </Field>
          <Field label="Policy accessibility">
            <textarea
              maxLength={2000}
              value={draft.policies.accessibility ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  policies: {
                    ...draft.policies,
                    accessibility: event.target.value,
                  },
                })
              }
            />
          </Field>
          <Field label="Minimum age">
            <input
              min={0}
              type="number"
              value={draft.policies.age_limit}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  policies: {
                    ...draft.policies,
                    age_limit: Number(event.target.value),
                  },
                })
              }
            />
          </Field>
          <label className={styles.check}>
            <input
              checked={draft.banner.featured}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  banner: event.target.checked
                    ? { featured: true }
                    : { featured: false },
                  banner_asset_id: event.target.checked
                    ? draft.banner_asset_id
                    : "",
                })
              }
              type="checkbox"
            />
            Feature this event in a scheduled banner
          </label>
          {draft.banner.featured ? (
            <fieldset className={styles.bannerFields}>
              <legend>Featured banner schedule</legend>
              <Field label="Banner asset UUID">
                <input
                  aria-describedby="banner-preview"
                  pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
                  required
                  value={draft.banner_asset_id ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, banner_asset_id: event.target.value })
                  }
                />
              </Field>
              <div className={styles.grid}>
                <Field label="Banner starts at">
                  <input
                    required
                    type="datetime-local"
                    value={localDate(draft.banner.starts_at ?? "")}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        banner: {
                          ...draft.banner,
                          starts_at: isoDate(event.target.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Banner ends at">
                  <input
                    required
                    type="datetime-local"
                    value={localDate(draft.banner.ends_at ?? "")}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        banner: {
                          ...draft.banner,
                          ends_at: isoDate(event.target.value),
                        },
                      })
                    }
                  />
                </Field>
              </div>
              <p id="banner-preview" className={styles.preview}>
                Banner preview: asset {draft.banner_asset_id || "required"} runs{" "}
                {draft.banner.starts_at
                  ? localDate(draft.banner.starts_at)
                  : "start required"}{" "}
                to{" "}
                {draft.banner.ends_at
                  ? localDate(draft.banner.ends_at)
                  : "end required"}
                .
              </p>
            </fieldset>
          ) : null}
          <button disabled={pending} type="submit">
            {pending ? "Saving…" : "Save draft"}
          </button>
        </form>
        {selected?.status === "draft" ? (
          <button
            disabled={pending}
            onClick={() => void transition("publish")}
            type="button"
          >
            Publish event
          </button>
        ) : null}
        {selected?.status === "published" ? (
          <button
            disabled={pending}
            onClick={() => void transition("cancel")}
            type="button"
          >
            Cancel event
          </button>
        ) : null}
      </section>

      {selected ? (
        <section className={styles.panel} aria-labelledby="ticket-title">
          <h2 id="ticket-title">Ticket types</h2>
          <ul className={styles.list}>
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <strong>{ticket.name}</strong>
                <span>
                  {ticket.currency} {ticket.price}
                </span>
                <span>
                  {ticket.sold + ticket.reserved} / {ticket.capacity} committed
                  · {ticket.status}
                </span>
                {selected.status === "published" ? (
                  <button
                    disabled={pending}
                    onClick={() => void pause(ticket)}
                    type="button"
                  >
                    {ticket.paused ? "Resume sales" : "Pause sales"}
                  </button>
                ) : null}
                {selected.status === "draft" ? (
                  <button
                    onClick={() => {
                      setSelectedTicket(ticket);
                      setTicketDraft(stripTicket(ticket));
                    }}
                    type="button"
                  >
                    Edit ticket type {ticket.name}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {selected.status === "draft" ? (
            <form
              className={styles.form}
              onSubmit={(event) => void addTicket(event)}
            >
              <h3>{selectedTicket ? "Edit ticket type" : "Add ticket type"}</h3>
              <div className={styles.grid}>
                <Field label="Ticket name">
                  <input
                    maxLength={120}
                    required
                    value={ticketDraft.name}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        name: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Ticket description">
                  <textarea
                    maxLength={2000}
                    value={ticketDraft.description}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        description: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Price">
                  <input
                    inputMode="decimal"
                    pattern="[0-9]+(\.[0-9]{1,2})?"
                    required
                    value={ticketDraft.price}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        price: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Currency">
                  <select
                    required
                    value={ticketDraft.currency}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        currency: event.target.value,
                      })
                    }
                  >
                    {["GHS", "USD", "EUR", "GBP"].map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Sort order">
                  <input
                    min={0}
                    max={10000}
                    type="number"
                    value={ticketDraft.sort_order}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        sort_order: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Ticket capacity">
                  <input
                    min={1}
                    required
                    type="number"
                    value={ticketDraft.capacity}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        capacity: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Minimum per order">
                  <input
                    min={1}
                    type="number"
                    value={ticketDraft.min_per_order}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        min_per_order: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Maximum per order">
                  <input
                    min={1}
                    type="number"
                    value={ticketDraft.max_per_order}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        max_per_order: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Sales start">
                  <input
                    required
                    type="datetime-local"
                    value={localDate(ticketDraft.sales_start)}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        sales_start: isoDate(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Sales end">
                  <input
                    required
                    type="datetime-local"
                    value={localDate(ticketDraft.sales_end)}
                    onChange={(event) =>
                      setTicketDraft({
                        ...ticketDraft,
                        sales_end: isoDate(event.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <button disabled={pending} type="submit">
                {selectedTicket ? "Update ticket type" : "Add ticket type"}
              </button>
              {selectedTicket ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTicket(null);
                    setTicketDraft({
                      ...emptyTicket,
                      sort_order: tickets.length + 1,
                    });
                  }}
                >
                  Cancel ticket edit
                </button>
              ) : null}
            </form>
          ) : null}
        </section>
      ) : null}
      <div aria-live="polite">{message}</div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function stripEvent(event: EventRecord): EventDraft {
  return {
    title: event.title,
    summary: event.summary,
    description: event.description,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    timezone: event.timezone,
    capacity: event.capacity,
    banner_asset_id: event.banner_asset_id,
    banner: event.banner,
    venue: event.venue,
    policies: event.policies,
  };
}
function mutationHeaders() {
  const token =
    document.cookie.match(/(?:^|; )jk_admin_csrf=([^;]+)/)?.[1] ?? "";
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": decodeURIComponent(token),
  };
}

function stripTicket(ticket: Ticket) {
  return {
    name: ticket.name,
    description: ticket.description ?? "",
    price: ticket.price,
    currency: ticket.currency,
    capacity: ticket.capacity,
    min_per_order: ticket.min_per_order,
    max_per_order: ticket.max_per_order,
    sales_start: ticket.sales_start,
    sales_end: ticket.sales_end,
    sort_order: ticket.sort_order,
  };
}
function localDate(value: string) {
  return value ? value.slice(0, 16) : "";
}
function isoDate(value: string) {
  return value ? new Date(value).toISOString() : "";
}
