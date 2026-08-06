"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import styles from "./scanner.module.css";

type ScanResult = {
  result: "admitted" | "already_checked_in" | "invalid" | "wrong_event" | "not_valid";
  ticket_ref?: string;
  checked_in_at?: string;
  checked_in_count: number;
  message?: string;
};

type Count = {
  event_id: string;
  checked_in_count: number;
};

const resultCopy: Record<ScanResult["result"], string> = {
  admitted: "Admitted",
  already_checked_in: "Already checked in",
  invalid: "Ticket not recognized",
  wrong_event: "Wrong event",
  not_valid: "Not valid for admission",
};

function csrfToken(): string {
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith("jk_admin_csrf="))
      ?.slice("jk_admin_csrf=".length) ?? ""
  );
}

export function Scanner() {
  const eventFieldId = useId();
  const tokenFieldId = useId();
  const [eventID, setEventID] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "offline" | "ready">("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refreshCount = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const response = await fetch(`/api/admin/checkin/events/${id}/count`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const body = (await response.json()) as Count;
      setCount(body.checked_in_count);
    } catch {
      /* count is best-effort */
    }
  }, []);

  useEffect(() => {
    if (!eventID) return;
    void refreshCount(eventID);
    const timer = window.setInterval(() => {
      if (!navigator.onLine) {
        setState((current) => (current === "loading" ? current : "offline"));
        return;
      }
      void refreshCount(eventID);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [eventID, refreshCount]);

  useEffect(() => {
    const onOnline = () => setState((current) => (current === "offline" ? "idle" : current));
    const onOffline = () => setState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!navigator.onLine) {
      setState("offline");
      setError("You are offline. Reconnect before scanning.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const nextEventID = String(form.get("event_id") ?? "").trim();
    const token = String(form.get("token") ?? "").trim();
    setEventID(nextEventID);
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/admin/checkin/scan", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": decodeURIComponent(csrfToken()),
        },
        body: JSON.stringify({ event_id: nextEventID, token, device_label: "admin-scanner" }),
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`scan failed:${response.status}`);
      }
      const body = (await response.json()) as ScanResult;
      setResult(body);
      setCount(body.checked_in_count);
      setState("ready");
      const tokenInput = formElement.elements.namedItem("token");
      if (tokenInput instanceof HTMLInputElement) {
        tokenInput.value = "";
        tokenInput.focus();
      }
    } catch {
      setResult(null);
      setState(navigator.onLine ? "idle" : "offline");
      setError(navigator.onLine ? "Check-in could not be completed. Try again." : "You are offline. Reconnect before scanning.");
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="checkin-heading">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Door operations</p>
        <h2 id="checkin-heading">Check-in scanner</h2>
        <p>Scan or paste a ticket bearer. Responses never include buyer personal data.</p>
      </header>

      <p className={styles.count} role="status" aria-live="polite">
        {count === null ? "Select an event to load live attendance." : `Checked in: ${count}`}
      </p>

      {state === "offline" ? (
        <p className={styles.offline} role="alert">
          Offline. Check-in requires a live connection so admissions stay atomic.
        </p>
      ) : null}

      <form className={styles.form} onSubmit={submit}>
        <label htmlFor={eventFieldId}>Event ID</label>
        <input
          id={eventFieldId}
          name="event_id"
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
          placeholder="Event UUID"
          onChange={(change) => setEventID(change.target.value.trim())}
        />

        <label htmlFor={tokenFieldId}>Scanned token or manual paste</label>
        <input
          id={tokenFieldId}
          name="token"
          type="text"
          required
          minLength={16}
          maxLength={512}
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          placeholder="Scan QR or paste bearer token"
        />

        <button type="submit" disabled={state === "loading" || state === "offline"}>
          {state === "loading" ? "Checking in…" : "Look up / Check in"}
        </button>
      </form>

      <div className={styles.result} aria-live="polite">
        {error ? <p className={styles.error}>{error}</p> : null}
        {result ? (
          <article className={styles.card} data-result={result.result}>
            <h3>{resultCopy[result.result]}</h3>
            {result.ticket_ref ? <p>Ticket ref {result.ticket_ref}</p> : null}
            {result.message ? <p>{result.message}</p> : null}
            {result.checked_in_at ? <p>Checked in at {new Date(result.checked_in_at).toLocaleString()}</p> : null}
            <p>Live count {result.checked_in_count}</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

export default Scanner;
