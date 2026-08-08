"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import styles from "./newsletter-workspace.module.css";

type Subscriber = {
  id: string;
  email: string;
  name?: string;
  source: string;
  status: string;
  consent_version: string;
  created_at: string;
};

function csrfCookie() {
  const prefix = "jk_admin_csrf=";
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

export function NewsletterWorkspace() {
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/newsletter", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error();
    const body = (await response.json()) as { subscribers: Subscriber[] };
    setSubscribers(body.subscribers ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() =>
        setError("Newsletter signups could not be loaded."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function unsubscribe(id: string) {
    setError("");
    const response = await fetch(
      `/api/admin/newsletter/${encodeURIComponent(id)}/unsubscribe`,
      {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfCookie() },
      },
    );
    if (!response.ok) {
      setError("Could not unsubscribe that address.");
      return;
    }
    await load();
  }

  if (error && !subscribers)
    return (
      <AdminErrorState
        message={error}
        title="Newsletter signups are unavailable"
      />
    );
  if (!subscribers)
    return <AdminSkeleton label="Loading newsletter signups" variant="table" />;

  return (
    <section className={styles.workspace} aria-labelledby="newsletter-heading">
      <header>
        <p>Pipeline</p>
        <h2 id="newsletter-heading">Newsletter signups</h2>
        <p>
          Consent-backed subscribers from the public site. Export-ready list for
          Resend audiences later.
        </p>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.panel}>
        {subscribers.length === 0 ? (
          <EmptyState
            announce={false}
            tone="inbox"
            title="No newsletter signups yet"
            description="Consent-backed signups from the public site land here. Publish the signup form on a live page to start collecting addresses."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Source</th>
                <th>Status</th>
                <th>Consent</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{row.name || "—"}</td>
                  <td>{row.source}</td>
                  <td>{row.status}</td>
                  <td>{row.consent_version}</td>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>
                    {row.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => void unsubscribe(row.id)}
                      >
                        Unsubscribe
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
