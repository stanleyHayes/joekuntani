"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { DateField } from "../../ui/date-field";
import { Select } from "../../ui/select";
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
    <div className={styles.grid}>
      <div>
        <h3>Campaign list</h3>
        {loading ? (
          <p role="status">Loading campaigns…</p>
        ) : items.length ? (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void choose(item)}>
                  <strong>{item.title}</strong>
                  <span>{item.status}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">No campaigns have been created.</p>
        )}
      </div>
      <div>
        <h3>Financial summary</h3>
        {selected ? (
          <article>
            <h4>{selected.title}</h4>
            <dl>
              <dt>Fee</dt>
              <dd>
                {selected.fee.currency} {selected.fee.amount}
              </dd>
              <dt>Expenses</dt>
              <dd>
                {selected.expenses.currency} {selected.expenses.amount}
              </dd>
              <dt>Results</dt>
              <dd>
                {selected.results.length ? (
                  <ul>
                    {selected.results.map((result) => (
                      <li key={`${result.label}-${result.value}`}>
                        {result.label}: {result.value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "No performance results recorded"
                )}
              </dd>
              <dt>Approved assets</dt>
              <dd>{selected.asset_ids.length}</dd>
            </dl>
            <label>
              Status
              <Select
                value={selected.status}
                onChange={(value) => void transition(selected, value)}
                options={statuses.map((s) => ({ value: s, label: s }))}
                aria-label="Campaign status"
              />
            </label>
            <h4>Deliverables</h4>
            {deliverables.length ? (
              <ul>
                {deliverables.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
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
              <p>No deliverables yet.</p>
            )}
            <form onSubmit={addDeliverable}>
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
              <label>
                Asset IDs (comma separated)
                <input name="asset_ids" />
              </label>
              <button type="submit">Add deliverable</button>
            </form>
          </article>
        ) : (
          <p>Select a campaign.</p>
        )}
      </div>
      <form onSubmit={create}>
        <h3>New campaign</h3>
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
          <label key={name}>
            {name.replaceAll("_", " ")}
            <input
              name={name}
              type={name.endsWith("_on") ? "date" : "text"}
              required={!["results", "asset_ids"].includes(name)}
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
        <button type="submit">Create campaign</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
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
