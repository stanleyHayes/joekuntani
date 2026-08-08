"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import styles from "./event-manager.module.css";
import { eventEditorHref, type EventRecord } from "./events-api";

/**
 * The event board: what exists, what state each one is in, and a way into the
 * editor. Everything that edits an event lives on /events/[id].
 */
export function EventManager() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
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

  if (error)
    return <AdminErrorState title="Events are unavailable" message={error} />;

  return (
    <div className={styles.manager}>
      <section className={styles.panel} aria-labelledby="events-title">
        <header className="stage-head">
          <div className="stage-head__copy">
            <p className="stage-head__eyebrow">Ticketing operations</p>
            <h2 id="events-title">Event workspace</h2>
            <p className="stage-head__lede">
              Create private drafts, verify the protected preview, then publish
              through explicit audited actions. Drafts stay private until an
              authorized publish succeeds.
            </p>
          </div>
          <div className="stage-head__actions">
            <Link className={styles.add} href={eventEditorHref("")}>
              Add event
            </Link>
          </div>
        </header>
        {loading ? (
          <AdminSkeleton label="Loading events" variant="table" />
        ) : events.length === 0 ? (
          <EmptyState
            tone="calendar"
            title="No events on the board"
            description="No approved event content exists yet."
          />
        ) : (
          <div className={styles.board}>
            <div className={styles.boardHead}>
              <div>
                <span>Event register</span>
                <strong>{events.length} total</strong>
              </div>
              <div>
                <span>Published</span>
                <strong>
                  {events.filter((item) => item.status === "published").length}
                </strong>
              </div>
              <div>
                <span>Drafts</span>
                <strong>
                  {events.filter((item) => item.status === "draft").length}
                </strong>
              </div>
            </div>
            <ul className={styles.list}>
              {events.map((item) => (
                <li key={item.id}>
                  <span className={styles.eventIndex}>
                    {String(events.indexOf(item) + 1).padStart(2, "0")}
                  </span>
                  <div className={styles.eventCopy}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.starts_at
                        ? new Date(item.starts_at).toLocaleDateString()
                        : "Date pending"}{" "}
                      · {item.venue?.city || "Venue pending"}
                    </span>
                  </div>
                  <span className={styles.status} data-status={item.status}>
                    {item.status}
                  </span>
                  <Link
                    className={styles.rowLink}
                    href={eventEditorHref(item.id)}
                  >
                    <span>Edit and preview {item.title}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
