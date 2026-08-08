"use client";

import { FormEvent, useRef, useState } from "react";
import { AdminErrorState, ButtonPending } from "../admin-feedback";
import styles from "./audit-workspace.module.css";
import { SectionSwitcher } from "../section-switcher";

type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  outcome?: string;
  created_at: string;
};

type AuditResponse = {
  query: string;
  items: AuditEntry[];
  limited: boolean;
};

export function AuditWorkspace() {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [response, setResponse] = useState<AuditResponse | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = String(data.get("query") ?? "").trim();
    const action = String(data.get("action") ?? "").trim();
    const entityType = String(data.get("entity_type") ?? "").trim();
    controller.current?.abort();
    controller.current = new AbortController();
    setState("loading");
    const params = new URLSearchParams({ limit: "50" });
    if (query) params.set("q", query);
    if (action) params.set("action", action);
    if (entityType) params.set("entity_type", entityType);
    try {
      const result = await fetch(`/api/admin/audit?${params.toString()}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.current.signal,
      });
      if (!result.ok) throw new Error("audit failed");
      setResponse((await result.json()) as AuditResponse);
      setState("ready");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setResponse(null);
        setState("error");
      }
    }
  }

  const count = response?.items.length ?? 0;
  return (
    <section className={styles.workspace} aria-labelledby="audit-heading">
      <SectionSwitcher section="governance" current="/admin/audit" />
      <header className={styles.header}>
        <p className={styles.eyebrow}>Administrator only</p>
        <h2 id="audit-heading">Search the audit log</h2>
        <p>
          Review sign-in, create, update, delete, publish, status and export
          events without exposing personal data payloads.
        </p>
      </header>

      <form className={styles.form} role="search" onSubmit={submit}>
        <div className={styles.queryIntro}>
          <span>Query builder</span>
          <h3>Find a recorded action</h3>
          <p>
            Combine any filters below. Leave a field empty to keep the search
            broad.
          </p>
        </div>
        <div className={styles.fields}>
          <label htmlFor="audit-query">
            Free-text filter
            <input
              id="audit-query"
              name="query"
              type="search"
              maxLength={100}
              autoComplete="off"
              placeholder="export, publish, sign_in"
            />
          </label>
          <label htmlFor="audit-action">
            Exact action
            <input
              id="audit-action"
              name="action"
              type="text"
              maxLength={80}
              autoComplete="off"
              placeholder="export.bookings"
            />
          </label>
          <label htmlFor="audit-entity-type">
            Entity type
            <input
              id="audit-entity-type"
              name="entity_type"
              type="text"
              maxLength={80}
              autoComplete="off"
              placeholder="export"
            />
          </label>
        </div>
        <button type="submit" disabled={state === "loading"}>
          {state === "loading" ? (
            <ButtonPending label="Searching audit log" />
          ) : (
            "Search audit log"
          )}
        </button>
      </form>

      <p className={styles.status} role="status" aria-live="polite">
        {state === "idle" && "Enter filters to inspect audited actions."}
        {state === "error" ? (
          <span hidden>Audit search could not be completed.</span>
        ) : null}
        {state === "ready" &&
          `${count} event${count === 1 ? "" : "s"} matched.`}
      </p>
      {state === "error" ? (
        <AdminErrorState
          title="Audit search failed"
          message="The audit log could not be queried. Check the filters and try again."
          retry={false}
        />
      ) : null}

      {state === "ready" && count === 0 ? (
        <div className={styles.empty}>
          <h3>No audit events</h3>
          <p>Try a broader action or entity type.</p>
        </div>
      ) : null}

      {count > 0 ? (
        <div className={styles.results}>
          <div className={styles.resultsHead}>
            <span>Results register</span>
            <strong>{count} matched</strong>
          </div>
          <table className={styles.table}>
            <caption className={styles.caption}>Audit events</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Action</th>
                <th scope="col">Entity</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {response?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <time dateTime={item.created_at}>
                      {new Date(item.created_at).toUTCString()}
                    </time>
                  </td>
                  <td>{item.action}</td>
                  <td>
                    {item.entity_type}
                    {item.entity_id ? ` · ${item.entity_id}` : ""}
                  </td>
                  <td>{item.outcome || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {response?.limited ? (
        <p className={styles.notice}>
          Showing the first 50 matches. Narrow the filters to continue.
        </p>
      ) : null}
    </section>
  );
}
