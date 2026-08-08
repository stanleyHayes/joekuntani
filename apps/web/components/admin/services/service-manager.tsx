"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { PublicService } from "../../services/types";
import { EmptyState } from "../../ui/empty-state";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { mutationHeaders, serviceEditorHref } from "./services-api";
import styles from "./service-manager.module.css";

export function ServiceManager() {
  const [items, setItems] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/services", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { items: PublicService[] };
        setItems(body.items ?? []);
      } catch {
        setError("Services could not be loaded. Try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function setActive(item: PublicService) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/services/${item.id}/active`, {
        method: "PATCH",
        credentials: "include",
        headers: mutationHeaders(),
        body: JSON.stringify({ active: !item.active, version: item.version }),
      });
      if (!response.ok) throw new Error();
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                active: !candidate.active,
                state: candidate.active ? "inactive" : "active",
                version: candidate.version + 1,
              }
            : candidate,
        ),
      );
      setMessage(item.active ? "Service unpublished." : "Service published.");
    } catch {
      setError("The service state could not be changed.");
    } finally {
      setPending(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return;
    const ordered = [...items];
    [ordered[index], ordered[destination]] = [
      ordered[destination]!,
      ordered[index]!,
    ];
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/services/order", {
        method: "PUT",
        credentials: "include",
        headers: mutationHeaders(),
        body: JSON.stringify({
          items: ordered
            .filter((item) => item.state !== "retired")
            .map((item) => ({ id: item.id, version: item.version })),
        }),
      });
      if (!response.ok) throw new Error();
      setItems(
        ordered.map((item, order) =>
          item.state === "retired"
            ? item
            : { ...item, sort_order: order, version: item.version + 1 },
        ),
      );
      setMessage("Display order saved and audited.");
    } catch {
      setError("Display order could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function retire(item: PublicService) {
    const confirmed = window.confirm(
      `Retire ${item.name}? It will leave public pages but remain in service history.`,
    );
    if (!confirmed) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/services/${item.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { ...mutationHeaders(), "If-Match": String(item.version) },
      });
      if (!response.ok) throw new Error();
      const retired = (await response.json()) as PublicService;
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === retired.id ? retired : candidate,
        ),
      );
      setMessage("Service retired and retained in history.");
    } catch {
      setError("The service could not be retired. Refresh and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.manager}>
      <section className={styles.panel} aria-labelledby="service-list-title">
        <header className="stage-head">
          <div className="stage-head__copy">
            <p className="stage-head__eyebrow">Public offering</p>
            <h2 id="service-list-title">Services</h2>
            <p className="stage-head__lede">
              Only active services appear publicly. Order changes apply to the
              public services page.
            </p>
          </div>
          <div className="stage-head__actions">
            <Link className={styles.addService} href={serviceEditorHref("")}>
              Add service
            </Link>
          </div>
        </header>
        {loading ? (
          <AdminSkeleton label="Loading services" variant="table" />
        ) : items.length === 0 ? (
          <EmptyState
            announce={false}
            tone="stage"
            title="No services yet"
            description="Create the first approved service, then publish it when the details are complete."
          />
        ) : (
          <ol className={styles.list}>
            {items.map((item, index) => (
              <li className={styles.item} key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.state === "retired"
                      ? "Retired"
                      : item.active
                        ? "Published"
                        : "Inactive"}
                  </span>
                  <span>/{item.slug}</span>
                </div>
                <div className={styles.itemActions}>
                  <button
                    aria-label={`Move ${item.name} up`}
                    disabled={
                      pending || item.state === "retired" || index === 0
                    }
                    onClick={() => void move(index, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${item.name} down`}
                    disabled={
                      pending ||
                      item.state === "retired" ||
                      index === items.length - 1
                    }
                    onClick={() => void move(index, 1)}
                    type="button"
                  >
                    ↓
                  </button>
                  {/* A retired service is not editable, and a link cannot be
                      disabled, so it keeps the button it always had. */}
                  {item.state === "retired" ? (
                    <button disabled type="button">
                      Edit
                    </button>
                  ) : (
                    <Link
                      className={styles.rowLink}
                      href={serviceEditorHref(item.id)}
                    >
                      Edit
                    </Link>
                  )}
                  <button
                    disabled={pending || item.state === "retired"}
                    onClick={() => void setActive(item)}
                    type="button"
                  >
                    {item.active ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    disabled={pending || item.state === "retired"}
                    onClick={() => void retire(item)}
                    type="button"
                  >
                    Retire
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {error === "Services could not be loaded. Try again." ? (
        <AdminErrorState title="Services are unavailable" message={error} />
      ) : error || message ? (
        <p
          className={error ? styles.error : styles.status}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
      ) : null}
    </div>
  );
}
