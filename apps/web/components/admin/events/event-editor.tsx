"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { AiAssist } from "../../ui/ai-assist";
import { DateField } from "../../ui/date-field";
import { Select } from "../../ui/select";
import {
  AdminErrorState,
  AdminSkeleton,
  ButtonPending,
} from "../admin-feedback";
import { AssetUploadField } from "../media/asset-picker";
import styles from "./event-editor.module.css";
import {
  emptyEvent,
  emptyTicket,
  eventEditorHref,
  mutationHeaders,
  type EventDraft,
  type EventRecord,
  type Ticket,
  type TicketDraft,
} from "./events-api";

/**
 * The event editor, as a page.
 *
 * It used to be a dialog holding some forty controls plus the whole ticket-type
 * sub-editor. A modal that large scrolls inside itself, which puts its own save
 * button out of reach, and one stray click outside it threw the draft away. On
 * a page the sections have room to be found, and the browser's back button
 * means what it says.
 */
export function EventEditor({ eventID }: { eventID: string }) {
  const creating = eventID === "new";
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [draft, setDraft] = useState<EventDraft>(emptyEvent);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketDraft, setTicketDraft] = useState<TicketDraft>(emptyTicket);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketEditorOpen, setTicketEditorOpen] = useState(false);
  const [loading, setLoading] = useState(!creating);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Deferred by a zero-delay timer so the first fetch never resolves inside the
  // effect body — the same idiom the other admin workspaces use.
  useEffect(() => {
    if (creating) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        let found: EventRecord | undefined;
        try {
          const response = await fetch("/api/admin/events", {
            cache: "no-store",
            credentials: "include",
          });
          if (!response.ok) throw new Error();
          const result = (await response.json()) as { items: EventRecord[] };
          found = (result.items ?? []).find((item) => item.id === eventID);
        } catch {
          // Handled below: no record means the editor cannot be opened.
        }
        setLoading(false);
        if (!found) {
          setLoadFailed(true);
          return;
        }
        setSelected(found);
        setDraft(stripEvent(found));
        // Ticket types only come from the protected preview, which is a
        // separate authorization from reading the event itself.
        try {
          const response = await fetch(
            `/api/admin/events/${found.id}/preview`,
            { cache: "no-store", credentials: "include" },
          );
          if (!response.ok) throw new Error();
          const result = (await response.json()) as { tickets: Ticket[] };
          setTickets(result.tickets ?? []);
        } catch {
          setTickets([]);
          setError("The protected preview could not be loaded.");
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [creating, eventID]);

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
      // Saving stays here rather than returning to the list: ticket types and
      // publishing both need the id the server has just minted, and routing an
      // operator back through the list to reach them helps nobody. The address
      // is corrected so a reload lands on the record, not on a blank form.
      if (!selected)
        window.history.replaceState(null, "", eventEditorHref(saved.id));
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
      setTicketEditorOpen(false);
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

  if (loadFailed)
    return (
      <AdminErrorState
        title="That event could not be opened"
        message="It may have been removed. Return to the events list and try again."
      />
    );
  if (loading) return <AdminSkeleton label="Loading event" variant="form" />;

  return (
    <section className={styles.editor} aria-labelledby="event-editor-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Ticketing operations</p>
          <h2 id="event-editor-heading">
            {selected ? `Edit ${selected.title || "event"}` : "New event"}
          </h2>
          <p className="stage-head__lede">
            A draft stays private until an authorized publish succeeds. Ticket
            types and the lifecycle actions appear once the draft has been
            saved.
          </p>
        </div>
        <div className="stage-head__actions">
          {selected ? (
            <span className={styles.status}>{selected.status}</span>
          ) : null}
          <Link className={styles.back} href="/admin/events">
            Back to events
          </Link>
        </div>
      </header>

      <div aria-live="polite" className={styles.message}>
        {message}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <form className={styles.form} onSubmit={(event) => void save(event)}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Identity</legend>
          <div className={styles.stack}>
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
            <Field
              label="Summary"
              assist={
                <AiAssist
                  field="summary"
                  label="Summary"
                  value={draft.summary}
                  onApply={(summary) =>
                    setDraft((current) => ({ ...current, summary }))
                  }
                />
              }
            >
              <textarea
                maxLength={320}
                value={draft.summary}
                onChange={(event) =>
                  setDraft({ ...draft, summary: event.target.value })
                }
              />
            </Field>
            <Field
              label="Description"
              assist={
                <AiAssist
                  field="description"
                  label="Description"
                  value={draft.description}
                  onApply={(description) =>
                    setDraft((current) => ({ ...current, description }))
                  }
                />
              }
            >
              <textarea
                maxLength={20000}
                rows={8}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Schedule</legend>
          <div className={styles.grid}>
            <Field label="Starts at">
              <DateField
                required
                aria-label="Starts at"
                mode="datetime"
                value={localDate(draft.starts_at)}
                onChange={(value) =>
                  setDraft({ ...draft, starts_at: isoDate(value) })
                }
              />
            </Field>
            <Field label="Ends at">
              <DateField
                required
                aria-label="Ends at"
                mode="datetime"
                value={localDate(draft.ends_at)}
                onChange={(value) =>
                  setDraft({ ...draft, ends_at: isoDate(value) })
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
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Venue</legend>
          <div className={styles.grid}>
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
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Policies</legend>
          <div className={styles.stack}>
            <Field label="Refund policy">
              <textarea
                maxLength={5000}
                required
                value={draft.policies.refunds}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    policies: {
                      ...draft.policies,
                      refunds: event.target.value,
                    },
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
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Banner</legend>
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
            <div className={styles.bannerFields}>
              {/* Was a text box demanding a hand-typed UUID that had to
                  satisfy a v4 regex — unusable without opening the media
                  library in another tab and copying an id across. */}
              <AssetUploadField
                label="Banner image"
                hint="Shown across the top of the site while this event is featured."
                folder="events"
                value={draft.banner_asset_id ?? ""}
                onChange={(banner_asset_id) =>
                  setDraft({ ...draft, banner_asset_id })
                }
              />
              <div className={styles.grid}>
                <Field label="Banner starts at">
                  <DateField
                    required
                    aria-label="Banner starts at"
                    mode="datetime"
                    value={localDate(draft.banner.starts_at ?? "")}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        banner: { ...draft.banner, starts_at: isoDate(value) },
                      })
                    }
                  />
                </Field>
                <Field label="Banner ends at">
                  <DateField
                    required
                    aria-label="Banner ends at"
                    mode="datetime"
                    value={localDate(draft.banner.ends_at ?? "")}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        banner: { ...draft.banner, ends_at: isoDate(value) },
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
            </div>
          ) : null}
        </fieldset>

        <div className={styles.actions}>
          <button className="primary" disabled={pending} type="submit">
            {pending ? (
              <ButtonPending label="Saving event draft" />
            ) : (
              "Save draft"
            )}
          </button>
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
          <Link className={styles.cancel} href="/admin/events">
            Done
          </Link>
        </div>
      </form>

      {selected ? (
        <section className={styles.ticketPanel} aria-labelledby="ticket-title">
          <h2 id="ticket-title" className={styles.ticketTitle}>
            Ticket types
          </h2>
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
                      setTicketEditorOpen(true);
                    }}
                    type="button"
                  >
                    Edit ticket type {ticket.name}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {selected.status === "draft" && !ticketEditorOpen ? (
            <button
              type="button"
              onClick={() => {
                setSelectedTicket(null);
                setTicketDraft({
                  ...emptyTicket,
                  sort_order: tickets.length + 1,
                });
                setTicketEditorOpen(true);
              }}
            >
              Add ticket type
            </button>
          ) : null}
          {selected.status === "draft" && ticketEditorOpen ? (
            <form
              className={styles.form}
              onSubmit={(event) => void addTicket(event)}
            >
              <fieldset className={styles.group}>
                <legend className={styles.legend}>
                  {selectedTicket ? "Edit ticket type" : "Add ticket type"}
                </legend>
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
                    <Select
                      required
                      value={ticketDraft.currency}
                      onChange={(currency) =>
                        setTicketDraft({ ...ticketDraft, currency })
                      }
                      options={["GHS", "USD", "EUR", "GBP"].map((currency) => ({
                        value: currency,
                        label: currency,
                      }))}
                      aria-label="Ticket currency"
                    />
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
                    <DateField
                      required
                      aria-label="Sales start"
                      mode="datetime"
                      value={localDate(ticketDraft.sales_start)}
                      onChange={(value) =>
                        setTicketDraft({
                          ...ticketDraft,
                          sales_start: isoDate(value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Sales end">
                    <DateField
                      required
                      aria-label="Sales end"
                      mode="datetime"
                      value={localDate(ticketDraft.sales_end)}
                      onChange={(value) =>
                        setTicketDraft({
                          ...ticketDraft,
                          sales_end: isoDate(value),
                        })
                      }
                    />
                  </Field>
                </div>
              </fieldset>
              {/* Not the sticky bar: two of those competing for the bottom of
                  the viewport would sit on top of each other. */}
              <div className={styles.ticketActions}>
                <button className="primary" disabled={pending} type="submit">
                  {selectedTicket ? "Update ticket type" : "Add ticket type"}
                </button>
                {selectedTicket ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTicket(null);
                      setTicketEditorOpen(false);
                      setTicketDraft({
                        ...emptyTicket,
                        sort_order: tickets.length + 1,
                      });
                    }}
                  >
                    Cancel ticket edit
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

/**
 * `assist` renders OUTSIDE the `<label>` on purpose. A label's accessible name
 * is computed from its text content, so an AI bar nested inside it appends
 * every button's text to the control's name — the Summary box stops being
 * "Summary" and becomes "Summary AI Rewrite Expand Shorten…".
 */
function Field({
  label,
  children,
  assist,
}: {
  label: string;
  children: ReactNode;
  assist?: ReactNode;
}) {
  const field = (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
  if (!assist) return field;
  return (
    <div className={styles.fieldGroup}>
      {field}
      {assist}
    </div>
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

function stripTicket(ticket: Ticket): TicketDraft {
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
