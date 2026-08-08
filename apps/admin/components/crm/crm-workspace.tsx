"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { Select } from "@joe-kuntani/shared/ui/select";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import {
  crmToolsHref,
  enquiryHref,
  request,
  stageLabels,
  stages,
  type Enquiry,
} from "./crm-api";
import styles from "./crm-workspace.module.css";

export function CRMWorkspace() {
  const [items, setItems] = useState<Enquiry[]>([]);
  const [query, setQuery] = useState(""),
    [stage, setStage] = useState(""),
    [owner, setOwner] = useState("");
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const activeFilters = [query, stage, owner].filter(Boolean).length;
  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (stage) params.set("stage", stage);
      if (owner) params.set("owner_id", owner);
      const enquiries = await request(`/api/admin/crm/enquiries?${params}`);
      setItems(enquiries.items ?? []);
      setError("");
    } catch {
      // Drop stale rows so the failure banner is never contradicted by a
      // "no results" message describing data we could not actually read.
      setItems([]);
      setError("CRM records are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [query, stage, owner]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function mutate(path: string, body?: unknown, method = "POST") {
    setMessage("");
    try {
      await request(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      setMessage("CRM change saved and audited.");
      await load();
    } catch {
      setMessage("The CRM change was not saved. Reload and try again.");
    }
  }
  async function privacyExport(contactID: string) {
    try {
      const data = await request(`/api/admin/crm/contacts/${contactID}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `privacy-export-${contactID}.json`;
      anchor.click();
      URL.revokeObjectURL(href);
      setMessage("Privacy export created and audited.");
    } catch {
      setMessage("Privacy export failed.");
    }
  }
  return (
    <section className={styles.workspace} aria-labelledby="crm-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Who wants to book Joe</p>
          <h2 id="crm-heading">Enquiry pipeline</h2>
          <p className="stage-head__lede">
            Qualify the people asking for Joe, without exposing their contact
            details outside authorized staff workflows.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link
            className={styles.headLink}
            href={crmToolsHref({ query, stage, owner })}
          >
            Open CRM tools
          </Link>
        </div>
      </header>
      <div className="stage-filters">
        <div className="stage-filters__head">
          <p className="stage-filters__title">Refine</p>
          <p className="stage-filters__meta">
            {loading
              ? "Loading…"
              : error
                ? "Count unavailable"
                : `${items.length} ${items.length === 1 ? "enquiry" : "enquiries"}`}
            {activeFilters ? ` · ${activeFilters} active` : ""}
          </p>
        </div>
        <div className="stage-filters__fields">
          <label>
            Search
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Reference or summary"
            />
          </label>
          <label>
            Stage
            <Select
              value={stage}
              onChange={setStage}
              placeholder="All stages"
              options={stages.map((value) => ({
                value,
                label: stageLabels[value],
              }))}
              aria-label="Stage filter"
            />
          </label>
          <label>
            Owner ID
            <input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>
        </div>
        <div className="stage-filters__actions">
          <button className="primary" onClick={() => void load()} type="button">
            Apply filters
          </button>
          {activeFilters ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStage("");
                setOwner("");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <AdminErrorState title="CRM is unavailable" message={error} />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {loading ? (
        <AdminSkeleton label="Loading CRM records" variant="table" />
      ) : error ? null : items.length === 0 ? (
        <EmptyState
          tone={activeFilters ? "search" : "inbox"}
          title={
            activeFilters ? "No matching enquiries" : "Nobody has asked yet"
          }
          description={
            activeFilters
              ? "No enquiries match these filters."
              : "Every booking request for Joe lands here the moment it is submitted."
          }
          action={
            activeFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStage("");
                  setOwner("");
                }}
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Enquiry</th>
              <th>Source</th>
              <th>Stage and owner</th>
              <th>Privacy and deletion</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className={styles.reference}>{item.reference}</span>
                  <span className={styles.summary}>
                    {item.summary || "No internal summary"}
                  </span>
                </td>
                <td>
                  <span className={styles.source}>{item.source}</span>
                  <span className={styles.summary}>{item.enquiry_type}</span>
                </td>
                <td>
                  <div className={styles.rowFields}>
                    <label>
                      Stage
                      <Select
                        aria-label={`Stage for ${item.reference}`}
                        value={item.stage}
                        onChange={(value) =>
                          void mutate(
                            `/api/admin/crm/enquiries/${item.id}/stage`,
                            { stage: value },
                            "PATCH",
                          )
                        }
                        options={stages.map((value) => ({
                          value,
                          label: stageLabels[value],
                        }))}
                      />
                    </label>
                    <label>
                      Owner
                      <input
                        aria-label={`Owner for ${item.reference}`}
                        defaultValue={item.owner_id}
                        onBlur={(e) => {
                          if (e.target.value !== item.owner_id)
                            void mutate(
                              `/api/admin/crm/enquiries/${item.id}/owner`,
                              { owner_id: e.target.value },
                              "PATCH",
                            );
                        }}
                      />
                    </label>
                  </div>
                </td>
                <td>
                  <div className={styles.rowButtons}>
                    <Link
                      className={styles.rowLink}
                      href={enquiryHref(item.id)}
                    >
                      Open notes, tasks and proposals
                    </Link>
                    <button
                      type="button"
                      onClick={() => void privacyExport(item.contact_id)}
                    >
                      Export contact data
                    </button>
                    <button
                      className={styles.danger}
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Anonymize and delete personal data for ${item.reference}?`,
                          )
                        )
                          void mutate(
                            `/api/admin/crm/contacts/${item.contact_id}/privacy-delete`,
                          );
                      }}
                    >
                      Delete personal data
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(`Archive and soft-delete ${item.reference}?`)
                        )
                          void mutate(
                            `/api/admin/crm/enquiries/${item.id}`,
                            undefined,
                            "DELETE",
                          );
                      }}
                    >
                      Soft delete enquiry
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
