"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { ButtonPending } from "../admin-feedback";
import styles from "./scanner.module.css";

type ScanResult = {
  result:
    | "admitted"
    | "already_checked_in"
    | "invalid"
    | "wrong_event"
    | "not_valid";
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
  const [state, setState] = useState<"idle" | "loading" | "offline" | "ready">(
    "idle",
  );
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
    const initial = window.setTimeout(() => void refreshCount(eventID), 0);
    const timer = window.setInterval(() => {
      if (!navigator.onLine) {
        setState((current) => (current === "loading" ? current : "offline"));
        return;
      }
      void refreshCount(eventID);
    }, 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [eventID, refreshCount]);

  useEffect(() => {
    const onOnline = () =>
      setState((current) => (current === "offline" ? "idle" : current));
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
        body: JSON.stringify({
          event_id: nextEventID,
          token,
          device_label: "admin-scanner",
        }),
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
      setError(
        navigator.onLine
          ? "Check-in could not be completed. Try again."
          : "You are offline. Reconnect before scanning.",
      );
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="checkin-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Door operations</p>
          <h2 id="checkin-heading">Check-in scanner</h2>
          <p className="stage-head__lede">
            Scan or paste a ticket at the door. Responses never include buyer
            personal data.
          </p>
        </div>
        <div className="stage-head__actions">
          <span
            className={styles.connection}
            data-offline={state === "offline"}
          >
            {state === "offline" ? "Offline" : "Live"}
          </span>
        </div>
      </header>

      {state === "offline" ? (
        <p className={styles.offline} role="alert">
          Offline. Check-in requires a live connection so admissions stay
          atomic.
        </p>
      ) : null}

      <div className={styles.console}>
        <div className={styles.scanBlock}>
          <div className={styles.scanIntro}>
            <div>
              <p className={styles.blockTitle}>Door console</p>
              <h3>Scan a ticket</h3>
            </div>
            <ol aria-label="Check-in steps">
              <li>
                <span>01</span>Select event
              </li>
              <li>
                <span>02</span>Scan token
              </li>
              <li>
                <span>03</span>Confirm result
              </li>
            </ol>
          </div>
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor={eventFieldId}>
              Event ID{" "}
              <span className={styles.hint}>— from the event page</span>
            </label>
            <input
              id={eventFieldId}
              name="event_id"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
              placeholder="Paste the event ID"
              onChange={(change) => setEventID(change.target.value.trim())}
            />

            <label htmlFor={tokenFieldId}>
              Scanned token{" "}
              <span className={styles.hint}>— or paste it manually</span>
            </label>
            <input
              id={tokenFieldId}
              className={styles.tokenInput}
              name="token"
              type="text"
              required
              minLength={16}
              maxLength={512}
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              placeholder="Scan the QR code"
            />

            <button
              className={styles.submit}
              type="submit"
              disabled={state === "loading" || state === "offline"}
            >
              {state === "loading" ? (
                <ButtonPending label="Checking in ticket" />
              ) : (
                "Look up / Check in"
              )}
            </button>
          </form>
        </div>

        <div className={styles.side}>
          <div className={styles.live} role="status" aria-live="polite">
            <p className={styles.blockTitle}>Checked in</p>
            {count === null ? (
              <p className={styles.liveIdle}>
                Enter an event ID to load live attendance.
              </p>
            ) : (
              <>
                <p className={styles.liveValue}>{count}</p>
                <p className={styles.liveMeta}>Refreshes every 5 seconds</p>
              </>
            )}
          </div>

          <div className={styles.result} aria-live="polite">
            {error ? <p className={styles.error}>{error}</p> : null}
            {result ? (
              <article className={styles.verdict} data-result={result.result}>
                <h3>{resultCopy[result.result]}</h3>
                {result.ticket_ref ? (
                  <p className={styles.verdictRef}>
                    Ticket ref {result.ticket_ref}
                  </p>
                ) : null}
                {result.message ? <p>{result.message}</p> : null}
                {result.checked_in_at ? (
                  <p>
                    Checked in at{" "}
                    {new Date(result.checked_in_at).toLocaleString()}
                  </p>
                ) : null}
              </article>
            ) : error ? null : (
              <p className={styles.waiting}>
                The scan result appears here — admitted, already used, or not
                valid.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Scanner;
