"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "../../ui/empty-state";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { campaignHref, request, type Campaign } from "./campaign-api";
import styles from "./campaign-workspace.module.css";

export function CampaignWorkspace() {
  const [items, setItems] = useState<Campaign[]>([]),
    [failed, setFailed] = useState(false),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await request("/api/admin/campaigns");
      setItems(value.items ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
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
          <Link className={styles.addCampaign} href={campaignHref("")}>
            Add campaign
          </Link>
        </div>
      </header>
      {failed ? (
        <AdminErrorState
          title="Campaigns are unavailable"
          message="Joe’s campaign records could not be loaded."
        />
      ) : loading ? (
        <AdminSkeleton label="Loading campaigns" variant="table" />
      ) : items.length ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id}>
              <Link
                className={styles.campaignCard}
                href={campaignHref(item.id)}
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
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          tone="media"
          title="No campaigns for Joe yet"
          description="When an enquiry becomes a signed partnership, build the campaign here to track Joe’s deliverables, assets, results and fee."
          action={
            <Link className={styles.addCampaign} href={campaignHref("")}>
              Add campaign
            </Link>
          }
        />
      )}
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
