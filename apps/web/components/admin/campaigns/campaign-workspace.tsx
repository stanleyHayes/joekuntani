"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { DateField } from "../../ui/date-field";
import { EmptyState } from "../../ui/empty-state";
import { Select } from "../../ui/select";
import { AdminDialog } from "../admin-dialog";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import styles from "./campaign-workspace.module.css";
type Campaign = {
  id: string;
  enquiry_id: string;
  organization_id: string;
  title: string;
  objective: string;
  status: string;
  platforms: string[];
  starts_on: string;
  ends_on: string;
  fee: { amount: string; currency: string };
  expenses: { amount: string; currency: string };
  results: { label: string; value: string }[];
  asset_ids: string[];
};
type Deliverable = {
  id: string;
  title: string;
  platform: string;
  format: string;
  status: string;
  approval_status: string;
  due_at: string;
  published_url: string;
  asset_ids: string[];
};
const statuses = ["draft", "active", "paused", "completed", "cancelled"];
const campaignFieldLabels: Record<string, string> = {
  enquiry_id: "Enquiry ID",
  organization_id: "Organization ID",
  title: "Campaign title",
  objective: "Objective",
  starts_on: "Start date",
  ends_on: "End date",
  fee: "Fee",
  expenses: "Expenses",
  platforms: "Platforms",
  results: "Results",
  asset_ids: "Asset IDs",
};
/* Free-text fields that hold lists or sentences get the full dialog width;
   the rest pair up two-per-row. */
const wideFields = new Set(["objective", "platforms", "results", "asset_ids"]);
const campaignFieldHints: Record<string, string> = {
  objective: "What Joe is being booked to achieve",
  platforms: "Instagram, TikTok, YouTube",
  results: "Reach=120000, Saves=4300",
  asset_ids: "Comma separated",
};
const deliverableStatuses = [
  "pending",
  "in_progress",
  "submitted",
  "approved",
  "published",
];
export function CampaignWorkspace() {
  const [items, setItems] = useState<Campaign[]>([]),
    [selected, setSelected] = useState<Campaign | null>(null),
    [createOpen, setCreateOpen] = useState(false),
    [detailOpen, setDetailOpen] = useState(false),
    [deliverableOpen, setDeliverableOpen] = useState(false),
    [deliverables, setDeliverables] = useState<Deliverable[]>([]),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await request("/api/admin/campaigns");
      setItems(value.items ?? []);
      setMessage("");
    } catch {
      setMessage("Campaigns are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await request("/api/admin/campaigns", {
        method: "POST",
        body: JSON.stringify({
          enquiry_id: f.get("enquiry_id"),
          organization_id: f.get("organization_id"),
          title: f.get("title"),
          objective: f.get("objective"),
          platforms: String(f.get("platforms") ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          starts_on: f.get("starts_on"),
          ends_on: f.get("ends_on"),
          status: "draft",
          fee: { amount: f.get("fee"), currency: f.get("currency") },
          expenses: { amount: f.get("expenses"), currency: f.get("currency") },
          results: parseResults(String(f.get("results") ?? "")),
          asset_ids: splitValues(String(f.get("asset_ids") ?? "")),
        }),
      });
      form.reset();
      setCreateOpen(false);
      await load();
      setMessage("Campaign created and audited.");
    } catch {
      setMessage("Campaign was not saved.");
    }
  }
  async function transition(item: Campaign, status: string) {
    try {
      const updated = await request(`/api/admin/campaigns/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...item,
          status,
          starts_on: item.starts_on.slice(0, 10),
          ends_on: item.ends_on.slice(0, 10),
        }),
      });
      setSelected(updated);
      await load();
      setMessage("Campaign status updated.");
    } catch {
      setMessage("Campaign status was not updated.");
    }
  }
  async function choose(item: Campaign) {
    setSelected(item);
    setDetailOpen(true);
    setDeliverableOpen(false);
    try {
      const detail = await request(`/api/admin/campaigns/${item.id}`);
      setDeliverables(detail.deliverables ?? []);
    } catch {
      setMessage("Campaign details are unavailable.");
    }
  }
  async function addDeliverable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/api/admin/campaigns/${selected.id}/deliverables`, {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          platform: data.get("platform"),
          format: data.get("format"),
          due_at: new Date(String(data.get("due_at"))).toISOString(),
          status: "pending",
          published_url: "",
          approval_status: "pending",
          asset_ids: splitValues(String(data.get("asset_ids") ?? "")),
        }),
      });
      form.reset();
      setDeliverableOpen(false);
      await choose(selected);
      setMessage("Deliverable added and audited.");
    } catch {
      setMessage("Deliverable was not saved.");
    }
  }
  async function updateDeliverable(item: Deliverable) {
    if (!selected) return;
    try {
      await request(
        `/api/admin/campaigns/${selected.id}/deliverables/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: item.title,
            platform: item.platform,
            format: item.format,
            due_at: item.due_at,
            status: item.status,
            published_url: item.published_url,
            approval_status: item.approval_status,
            asset_ids: item.asset_ids,
          }),
        },
      );
      await choose(selected);
      setMessage("Deliverable updated and audited.");
    } catch {
      setMessage("Deliverable was not updated.");
    }
  }
  function replaceDeliverable(id: string, patch: Partial<Deliverable>) {
    setDeliverables((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }
  return (
    <section className={styles.workspace} aria-labelledby="campaign-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Brand partnerships</p>
          <h2 id="campaign-heading">Joe’s campaigns</h2>
          <p className="stage-head__lede">
            Every partnership Joe has signed — deliverables, assets, results,
            and what each one paid against what it cost.
          </p>
        </div>
        <div className="stage-head__actions">
          <button
            className="primary"
            type="button"
            onClick={() => setCreateOpen(true)}
          >
            Add campaign
          </button>
        </div>
      </header>
      {message === "Campaigns are unavailable." ? (
        <AdminErrorState
          title="Campaigns are unavailable"
          message="Joe’s campaign records could not be loaded."
        />
      ) : message ? (
        <p role="status">{message}</p>
      ) : null}
      {loading ? (
        <AdminSkeleton label="Loading campaigns" variant="table" />
      ) : message === "Campaigns are unavailable." ? null : items.length ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id}>
              <button
                className={styles.campaignCard}
                type="button"
                onClick={() => void choose(item)}
              >
                <span className={styles.titleRow}>
                  <strong>{item.title}</strong>
                  <span className={styles.pill} data-status={item.status}>
                    {item.status}
                  </span>
                </span>
                <span className={styles.objective}>
                  {item.objective || "No objective recorded"}
                </span>
                <span className={styles.meta}>
                  <span>{formatRange(item.starts_on, item.ends_on)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {item.fee.currency} {item.fee.amount}
                  </span>
                  {item.platforms.length ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{item.platforms.join(", ")}</span>
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          tone="media"
          title="No campaigns for Joe yet"
          description="When an enquiry becomes a signed partnership, build the campaign here to track Joe’s deliverables, assets, results and fee."
          action={
            <button type="button" onClick={() => setCreateOpen(true)}>
              Add campaign
            </button>
          }
        />
      )}
      {detailOpen && selected ? (
        <AdminDialog
          title={selected.title}
          description="Review campaign performance and manage its deliverables."
          onClose={() => setDetailOpen(false)}
          wide
        >
          <div className={styles.detail}>
            {selected ? (
              <article className={styles.detailBody}>
                <h3>Financial summary</h3>
                <dl className={styles.summary}>
                  <div>
                    <dt>Fee</dt>
                    <dd className={styles.figure}>
                      {selected.fee.currency} {selected.fee.amount}
                    </dd>
                  </div>
                  <div>
                    <dt>Expenses</dt>
                    <dd className={styles.figure}>
                      {selected.expenses.currency} {selected.expenses.amount}
                    </dd>
                  </div>
                  <div>
                    <dt>Approved assets</dt>
                    <dd className={styles.figure}>
                      {selected.asset_ids.length}
                    </dd>
                  </div>
                  <div className={styles.summaryWide}>
                    <dt>Results</dt>
                    <dd>
                      {selected.results.length ? (
                        <ul className={styles.results}>
                          {selected.results.map((result) => (
                            <li key={`${result.label}-${result.value}`}>
                              <span>{result.label}</span>
                              <strong>{result.value}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "No performance results recorded"
                      )}
                    </dd>
                  </div>
                </dl>
                <label className={styles.statusField}>
                  Status
                  <Select
                    value={selected.status}
                    onChange={(value) => void transition(selected, value)}
                    options={statuses.map((s) => ({ value: s, label: s }))}
                    aria-label="Campaign status"
                  />
                </label>
                <h3>Deliverables</h3>
                {deliverables.length ? (
                  <ul className={styles.deliverables}>
                    {deliverables.map((item) => (
                      <li className={styles.deliverable} key={item.id}>
                        <strong>{item.title}</strong>
                        <div className={styles.deliverableFields}>
                        <label>
                          Workflow status
                          <Select
                            aria-label={`${item.title} workflow status`}
                            value={item.status}
                            onChange={(value) =>
                              replaceDeliverable(item.id, {
                                status: value,
                              })
                            }
                            options={deliverableStatuses.map((status) => ({
                              value: status,
                              label: status,
                            }))}
                          />
                        </label>
                        <label>
                          Approval
                          <Select
                            aria-label={`${item.title} approval`}
                            value={item.approval_status}
                            onChange={(value) =>
                              replaceDeliverable(item.id, {
                                approval_status: value,
                              })
                            }
                            options={["pending", "approved", "rejected"].map(
                              (status) => ({ value: status, label: status }),
                            )}
                          />
                        </label>
                        <label>
                          Published URL
                          <input
                            aria-label={`${item.title} published URL`}
                            value={item.published_url}
                            onChange={(event) =>
                              replaceDeliverable(item.id, {
                                published_url: event.target.value,
                              })
                            }
                          />
                        </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => void updateDeliverable(item)}
                        >
                          Save deliverable
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    announce={false}
                    tone="media"
                    title="No deliverables yet"
                    description="Add the first deliverable to track its platform, format, due date, approval and published URL."
                  />
                )}
                {!deliverableOpen ? (
                  <button
                    type="button"
                    onClick={() => setDeliverableOpen(true)}
                  >
                    Add deliverable
                  </button>
                ) : (
                  <form className={styles.form} onSubmit={addDeliverable}>
                    <label>
                      Title
                      <input name="title" required />
                    </label>
                    <label>
                      Platform
                      <input name="platform" required />
                    </label>
                    <label>
                      Format
                      <input name="format" required />
                    </label>
                    <label>
                      Due at
                      <DateField
                        name="due_at"
                        aria-label="Due at"
                        mode="datetime"
                        required
                      />
                    </label>
                    <label className={styles.formWide}>
                      Asset IDs (comma separated)
                      <input name="asset_ids" />
                    </label>
                    <div className={styles.formActions}>
                      <button type="submit">Add deliverable</button>
                      <button
                        type="button"
                        onClick={() => setDeliverableOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </article>
            ) : (
              <p>Select a campaign.</p>
            )}
          </div>
        </AdminDialog>
      ) : null}
      {createOpen ? (
        <AdminDialog
          title="New campaign"
          description="Create a private campaign record linked to CRM."
          onClose={() => setCreateOpen(false)}
          wide
        >
          <form className={styles.form} onSubmit={create}>
            {[
              "enquiry_id",
              "organization_id",
              "title",
              "objective",
              "starts_on",
              "ends_on",
              "fee",
              "expenses",
              "platforms",
              "results",
              "asset_ids",
            ].map((name) => (
              <label
                key={name}
                className={wideFields.has(name) ? styles.formWide : undefined}
              >
                {campaignFieldLabels[name] ?? name.replaceAll("_", " ")}
                <input
                  name={name}
                  type={name.endsWith("_on") ? "date" : "text"}
                  required={!["results", "asset_ids"].includes(name)}
                  placeholder={campaignFieldHints[name]}
                />
              </label>
            ))}
            <label>
              Currency
              <Select
                name="currency"
                defaultValue="GHS"
                options={["GHS", "USD", "EUR", "GBP"].map((currency) => ({
                  value: currency,
                  label: currency,
                }))}
                aria-label="Campaign currency"
              />
            </label>
            <div className={styles.formActions}>
              <button type="submit">Create campaign</button>
            </div>
          </form>
        </AdminDialog>
      ) : null}
    </section>
  );
}
function formatRange(startsOn: string, endsOn: string) {
  const format = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const start = new Date(startsOn);
  const end = new Date(endsOn);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return "Dates not set";
  return `${format.format(start)} – ${format.format(end)}`;
}
function splitValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function parseResults(value: string) {
  return splitValues(value).map((item) => {
    const separator = item.indexOf("=");
    return separator < 1
      ? { label: item, value: item }
      : {
          label: item.slice(0, separator).trim(),
          value: item.slice(separator + 1).trim(),
        };
  });
}
async function request(path: string, init: RequestInit = {}) {
  const csrf =
    document.cookie
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("jk_admin_csrf="))
      ?.split("=")[1] ?? "";
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": decodeURIComponent(csrf),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error("request failed");
  return response.status === 204 ? {} : response.json();
}
