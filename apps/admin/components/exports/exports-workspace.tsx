"use client";

import { FormEvent, useEffect, useState } from "react";
import { Select } from "@joe-kuntani/shared/ui/select";
import {
  AdminErrorState,
  AdminSkeleton,
  ButtonPending,
} from "../admin-feedback";
import styles from "./exports-workspace.module.css";

type Resource = "enquiries" | "contacts" | "bookings" | "campaigns";

const labels: Record<Resource, string> = {
  enquiries: "Enquiries",
  contacts: "Contacts",
  bookings: "Bookings",
  campaigns: "Campaigns",
};

export function ExportsWorkspace() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [state, setState] = useState<
    "loading" | "ready" | "error" | "exporting"
  >("loading");
  const [message, setMessage] = useState(
    "Loading authorized export resources…",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/exports/resources", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("denied");
        const body = (await response.json()) as { resources?: Resource[] };
        if (!cancelled) {
          setResources(Array.isArray(body.resources) ? body.resources : []);
          setState("ready");
          setMessage("Choose a resource your role may export.");
        }
      } catch {
        if (!cancelled) {
          setResources([]);
          setState("error");
          setMessage("Exports are unavailable.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resource = String(
      new FormData(event.currentTarget).get("resource") ?? "",
    ) as Resource;
    if (!resources.includes(resource)) {
      setState("error");
      setMessage("That export is not available for your role.");
      return;
    }
    setState("exporting");
    setMessage("Preparing audited CSV download…");
    try {
      const response = await fetch(`/api/admin/exports/${resource}`, {
        credentials: "same-origin",
        headers: { Accept: "text/csv" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${resource}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setState("ready");
      setMessage(`${labels[resource]} CSV downloaded. The export was audited.`);
    } catch {
      setState("error");
      setMessage("Export could not be completed.");
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="exports-heading">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Governance</p>
        <h2 id="exports-heading">Role-filtered CSV exports</h2>
        <p>
          Downloads are limited to the operational records your role may access
          and are written to the audit log.
        </p>
      </header>

      {state === "loading" ? (
        <AdminSkeleton
          label="Loading authorized export resources"
          variant="form"
        />
      ) : null}
      {state === "error" && resources.length === 0 ? (
        <AdminErrorState title="Exports are unavailable" message={message} />
      ) : null}

      {state !== "loading" ? (
        <div className={styles.exportDesk}>
          <aside className={styles.guide}>
            <span>01 / Export desk</span>
            <h3>Take only what your role permits.</h3>
            <p>Every generated file is recorded in the audit log.</p>
            <ul>
              <li>
                <strong>CSV</strong>
                <span>Portable structured data</span>
              </li>
              <li>
                <strong>Scoped</strong>
                <span>Filtered by your role</span>
              </li>
              <li>
                <strong>Audited</strong>
                <span>Recorded automatically</span>
              </li>
            </ul>
          </aside>
          <form className={styles.form} onSubmit={download}>
            <div className={styles.formIntro}>
              <span>02 / Choose records</span>
              <h3>Prepare a new export</h3>
              <p>
                Select one approved record set. The file is prepared only after
                confirmation.
              </p>
            </div>
            <label htmlFor="export-resource">Resource</label>
            <Select
              id="export-resource"
              name="resource"
              required
              disabled={resources.length === 0}
              placeholder={
                resources.length === 0
                  ? "No exports available"
                  : "Choose resource"
              }
              options={resources.map((resource) => ({
                value: resource,
                label: labels[resource],
              }))}
              aria-label="Export resource"
            />
            <div className={styles.confirmRow}>
              <p>CSV · role-filtered · audit recorded</p>
              <button
                aria-label="Download CSV"
                className={styles.download}
                type="submit"
                disabled={state === "exporting" || resources.length === 0}
              >
                {state === "exporting" ? (
                  <ButtonPending label="Preparing CSV export" />
                ) : (
                  "Prepare download"
                )}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {state !== "loading" ? (
        <p className={styles.status} role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
