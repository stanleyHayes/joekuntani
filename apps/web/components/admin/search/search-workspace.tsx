"use client";

import { FormEvent, useRef, useState } from "react";
import { AdminErrorState, ButtonPending } from "../admin-feedback";
import styles from "./search-workspace.module.css";

type Kind = "enquiry" | "contact" | "campaign" | "booking" | "content";
type SearchResult = {
  id: string;
  kind: Kind;
  title: string;
  context: string;
  href: string;
};
type SearchResponse = {
  query: string;
  items: SearchResult[];
  limited: boolean;
};

const labels: Record<Kind, string> = {
  enquiry: "Enquiry",
  contact: "Contact",
  campaign: "Campaign",
  booking: "Booking",
  content: "Content",
};

export function SearchWorkspace() {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("query") ?? "",
    ).trim();
    if (query.length < 2) {
      setResponse(null);
      setState("error");
      return;
    }
    controller.current?.abort();
    controller.current = new AbortController();
    setState("loading");
    try {
      const result = await fetch(
        `/api/admin/search?q=${encodeURIComponent(query)}&limit=25`,
        {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.current.signal,
        },
      );
      if (!result.ok) throw new Error("search failed");
      setResponse((await result.json()) as SearchResponse);
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
    <section className={styles.workspace} aria-labelledby="search-heading">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Authorized workspace</p>
        <h2 id="search-heading">Find operational records</h2>
        <p>
          Results are automatically limited to the records your role may access.
        </p>
      </header>

      <form className={styles.form} role="search" onSubmit={submit}>
        <label htmlFor="admin-global-query">
          Search enquiries, contacts, campaigns, bookings and content
        </label>
        <div className={styles.controls}>
          <input
            id="admin-global-query"
            name="query"
            type="search"
            minLength={2}
            maxLength={100}
            required
            autoComplete="off"
            placeholder="Try a reference, title or name"
          />
          <button type="submit" disabled={state === "loading"}>
            {state === "loading" ? (
              <ButtonPending label="Searching records" />
            ) : (
              "Search"
            )}
          </button>
        </div>
        <p className={styles.hint}>
          Use at least two characters. Sensitive detail is never shown in search
          results.
        </p>
      </form>

      <p className={styles.status} role="status" aria-live="polite">
        {state === "idle" && "Enter a query to begin."}
        {state === "error" ? (
          <span hidden>Search could not be completed.</span>
        ) : null}
        {state === "ready" &&
          `${count} result${count === 1 ? "" : "s"} for “${response?.query}”.`}
      </p>
      {state === "error" ? (
        <AdminErrorState
          title="Search could not be completed"
          message="Check the query and try again. Search terms must contain at least two characters."
          retry={false}
        />
      ) : null}

      {state === "ready" && count === 0 ? (
        <div className={styles.empty}>
          <h3>No matches</h3>
          <p>Try a different reference, title or name.</p>
        </div>
      ) : null}
      {count > 0 ? (
        <ul className={styles.results} aria-label="Search results">
          {response?.items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <a href={item.href}>
                <span className={styles.kind}>{labels[item.kind]}</span>
                <strong>{item.title}</strong>
                {item.context ? (
                  <span className={styles.context}>
                    {item.context.replaceAll("_", " ")}
                  </span>
                ) : null}
                <span className={styles.open} aria-hidden="true">
                  Open →
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {response?.limited ? (
        <p className={styles.notice}>
          Showing the first 25 matches. Refine your query to narrow the list.
        </p>
      ) : null}
    </section>
  );
}
