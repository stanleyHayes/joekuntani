"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AdminErrorState,
  AdminSkeleton,
  ButtonPending,
} from "../admin-feedback";
import { MetricWatermark } from "../metric-watermark";
import { SectionSwitcher } from "../section-switcher";
import styles from "./privacy-workspace.module.css";

type Status = {
  retention_months: number;
  eligible_count: number;
  active_holds: number;
  generated_at: string;
};

type Hold = {
  id: string;
  contact_id: string;
  reason: string;
  created_at: string;
  cleared_at?: string;
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function csrfToken(): string {
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith("jk_admin_csrf="))
      ?.slice("jk_admin_csrf=".length) ?? ""
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(method !== "GET"
        ? {
            "Content-Type": "application/json",
            "X-CSRF-Token": decodeURIComponent(csrfToken()),
          }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`request failed:${response.status}`);
  }
  return (await response.json()) as T;
}

export function PrivacyWorkspace() {
  const [status, setStatus] = useState<Status | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [message, setMessage] = useState("Loading privacy controls…");
  const [busy, setBusy] = useState(false);
  const [busyTarget, setBusyTarget] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const refresh = useCallback(async () => {
    const nextStatus = await api<Status>("/api/admin/privacy");
    const nextHolds = await api<{ items: Hold[] }>("/api/admin/privacy/holds");
    setStatus(nextStatus);
    setHolds(Array.isArray(nextHolds.items) ? nextHolds.items : []);
    setMessage(
      `Default enquiry retention is ${countLabel(nextStatus.retention_months, "month")}. ${countLabel(nextStatus.eligible_count, "enquiry", "enquiries")} eligible; ${countLabel(nextStatus.active_holds, "active hold")}.`,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
        if (!cancelled) setLoadState("ready");
      } catch {
        if (!cancelled) {
          setStatus(null);
          setHolds([]);
          setMessage("Privacy controls are unavailable.");
          setLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function placeHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setBusyTarget("hold");
    try {
      await api("/api/admin/privacy/holds", {
        method: "POST",
        body: JSON.stringify({
          contact_id: String(data.get("contact_id") ?? "").trim(),
          reason: String(data.get("reason") ?? "").trim(),
        }),
      });
      form.reset();
      await refresh();
      setMessage(
        "Legal hold placed. Privacy deletion is blocked for that contact.",
      );
    } catch {
      setMessage("Could not place the legal hold.");
    } finally {
      setBusy(false);
      setBusyTarget("");
    }
  }

  async function clearHold(contactID: string) {
    setBusy(true);
    setBusyTarget(`clear:${contactID}`);
    try {
      await api(`/api/admin/privacy/holds/${contactID}`, { method: "DELETE" });
      await refresh();
      setMessage("Legal hold cleared.");
    } catch {
      setMessage("Could not clear the legal hold.");
    } finally {
      setBusy(false);
      setBusyTarget("");
    }
  }

  async function runRetention() {
    setBusy(true);
    setBusyTarget("retention");
    try {
      const result = await api<{ purged: number; skipped: number }>(
        "/api/admin/privacy/retention?limit=25",
        {
          method: "POST",
          body: "{}",
        },
      );
      await refresh();
      setMessage(
        `Retention run complete. Purged ${result.purged}; skipped ${result.skipped} held contact(s).`,
      );
    } catch {
      setMessage("Retention run failed.");
    } finally {
      setBusy(false);
      setBusyTarget("");
    }
  }

  if (loadState === "loading")
    return <AdminSkeleton label="Loading privacy controls" variant="page" />;
  if (loadState === "error")
    return (
      <AdminErrorState
        message={message}
        title="Privacy controls are unavailable"
      />
    );

  return (
    <section className={styles.workspace} aria-labelledby="privacy-heading">
      <SectionSwitcher section="governance" current="/admin/privacy" />
      <header className={styles.header}>
        <p className={styles.eyebrow}>Governance</p>
        <h2 id="privacy-heading">Privacy and retention</h2>
        <p>
          Consent is versioned at enquiry intake with a hashed source IP.
          Administrators manage legal holds and the default 24-month enquiry
          retention purge.
        </p>
      </header>

      <p className={styles.status} role="status">
        {message}
      </p>

      {status ? (
        <dl className={styles.metrics}>
          <div>
            <MetricWatermark variant="orbit" />
            <dt>Retention months</dt>
            <dd>{status.retention_months}</dd>
          </div>
          <div>
            <MetricWatermark variant="wave" />
            <dt>Eligible enquiries</dt>
            <dd>{status.eligible_count}</dd>
          </div>
          <div>
            <MetricWatermark variant="spark" />
            <dt>Active holds</dt>
            <dd>{status.active_holds}</dd>
          </div>
        </dl>
      ) : null}

      <div className={styles.operations}>
        <form className={styles.form} onSubmit={placeHold}>
          <span className={styles.cardIndex}>01 / Legal control</span>
          <h3>Place legal hold</h3>
          <label htmlFor="privacy-contact-id">Contact ID</label>
          <input
            id="privacy-contact-id"
            name="contact_id"
            required
            minLength={36}
            maxLength={36}
            disabled={busy}
          />
          <label htmlFor="privacy-reason">Reason</label>
          <textarea
            id="privacy-reason"
            name="reason"
            required
            minLength={8}
            maxLength={500}
            rows={3}
            disabled={busy}
          />
          <button type="submit" disabled={busy}>
            {busyTarget === "hold" ? (
              <ButtonPending label="Placing legal hold" />
            ) : (
              "Place hold"
            )}
          </button>
        </form>

        <div className={styles.form}>
          <span className={styles.cardIndex}>02 / Data lifecycle</span>
          <h3>Retention job</h3>
          <p>
            Anonymizes enquiry personal data older than the default retention
            window unless a legal hold applies.
          </p>
          <button
            type="button"
            onClick={() => void runRetention()}
            disabled={busy || !status}
          >
            {busyTarget === "retention" ? (
              <ButtonPending label="Running retention batch" />
            ) : (
              "Run retention batch"
            )}
          </button>
        </div>
      </div>

      <div className={`${styles.form} ${styles.register}`}>
        <span className={styles.cardIndex}>03 / Hold register</span>
        <h3>Active holds</h3>
        {holds.length === 0 ? (
          <p className={styles.status}>No active legal holds.</p>
        ) : (
          <ul className={styles.holds}>
            {holds.map((hold) => (
              <li key={hold.id}>
                <div>
                  <strong>{hold.contact_id}</strong>
                  <p>{hold.reason}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void clearHold(hold.contact_id)}
                  disabled={busy}
                >
                  {busyTarget === `clear:${hold.contact_id}` ? (
                    <ButtonPending label="Clearing legal hold" />
                  ) : (
                    "Clear hold"
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
