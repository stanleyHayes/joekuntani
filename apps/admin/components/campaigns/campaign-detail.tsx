"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { DateField } from "@joe-kuntani/shared/ui/date-field";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { Select } from "@joe-kuntani/shared/ui/select";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import {
  approvalStatuses,
  campaignStatuses,
  deliverableStatuses,
  request,
  splitValues,
  type Campaign,
  type Deliverable,
} from "./campaign-api";
import styles from "./campaign-detail.module.css";

/**
 * One campaign, as a page.
 *
 * It used to be a dialog, and it never fitted: the status control, three
 * controls on every deliverable, and a five-control form to add another one.
 * A modal that deep scrolls inside itself, so the save button for the row an
 * operator is editing keeps sliding out of reach.
 */
export function CampaignDetail({ campaignID }: { campaignID: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null),
    [deliverables, setDeliverables] = useState<Deliverable[]>([]),
    [deliverableOpen, setDeliverableOpen] = useState(false),
    [message, setMessage] = useState(""),
    [loadFailed, setLoadFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const detail = await request(`/api/admin/campaigns/${campaignID}`);
      setCampaign(detail.campaign ?? null);
      setDeliverables(detail.deliverables ?? []);
    } catch {
      setMessage("Campaign details are unavailable.");
      setLoadFailed(true);
    }
  }, [campaignID]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
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
      setCampaign(updated);
      setMessage("Campaign status updated.");
    } catch {
      setMessage("Campaign status was not updated.");
    }
  }
  async function addDeliverable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!campaign) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/api/admin/campaigns/${campaign.id}/deliverables`, {
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
      await load();
      setMessage("Deliverable added and audited.");
    } catch {
      setMessage("Deliverable was not saved.");
    }
  }
  async function updateDeliverable(item: Deliverable) {
    if (!campaign) return;
    try {
      await request(
        `/api/admin/campaigns/${campaign.id}/deliverables/${item.id}`,
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
      await load();
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
  if (loadFailed && !campaign)
    return (
      <AdminErrorState
        title="Campaign details are unavailable"
        message="This campaign could not be opened. Return to the campaign list and try again."
      />
    );
  if (!campaign)
    return <AdminSkeleton label="Loading campaign" variant="table" />;
  return (
    <section
      className={styles.detail}
      aria-labelledby="campaign-detail-heading"
    >
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Brand partnerships</p>
          <h2 id="campaign-detail-heading">{campaign.title}</h2>
          <p className="stage-head__lede">
            Review campaign performance and manage its deliverables.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.back} href="/campaigns">
            Back to campaigns
          </Link>
        </div>
      </header>
      {message ? <p role="status">{message}</p> : null}
      <section className={styles.block} aria-labelledby="campaign-summary">
        <h3 id="campaign-summary">Financial summary</h3>
        <dl className={styles.summary}>
          <div>
            <dt>Fee</dt>
            <dd className={styles.figure}>
              {campaign.fee.currency} {campaign.fee.amount}
            </dd>
          </div>
          <div>
            <dt>Expenses</dt>
            <dd className={styles.figure}>
              {campaign.expenses.currency} {campaign.expenses.amount}
            </dd>
          </div>
          <div>
            <dt>Approved assets</dt>
            <dd className={styles.figure}>{campaign.asset_ids.length}</dd>
          </div>
          <div className={styles.summaryWide}>
            <dt>Results</dt>
            <dd>
              {campaign.results.length ? (
                <ul className={styles.results}>
                  {campaign.results.map((result) => (
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
            value={campaign.status}
            onChange={(value) => void transition(campaign, value)}
            options={campaignStatuses.map((s) => ({ value: s, label: s }))}
            aria-label="Campaign status"
          />
        </label>
      </section>
      <section className={styles.block} aria-labelledby="campaign-deliverables">
        <h3 id="campaign-deliverables">Deliverables</h3>
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
                      options={approvalStatuses.map((status) => ({
                        value: status,
                        label: status,
                      }))}
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
          <button type="button" onClick={() => setDeliverableOpen(true)}>
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
              <button type="button" onClick={() => setDeliverableOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </section>
  );
}
