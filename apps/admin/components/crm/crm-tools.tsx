"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  request,
  stageLabels,
  stages,
  type Contact,
  type Organization,
  type PipelineFilters,
  type Stage,
  type View,
} from "./crm-api";
import styles from "./crm-tools.module.css";

/**
 * The CRM tools, as a page.
 *
 * Thirteen controls across five forms. In a modal they only fitted by
 * scrolling, which pushed each form's own submit button out of sight, and a
 * click on the backdrop discarded half-typed contact details without warning.
 * On a page the forms sit side by side and the browser's back button returns
 * to the pipeline.
 */
export function CRMTools({ query, stage, owner }: PipelineFilters) {
  const [views, setViews] = useState<View[] | null>(null);
  const [viewsFailed, setViewsFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [foundContact, setFoundContact] = useState<Contact | null>(null);
  const [foundOrganization, setFoundOrganization] =
    useState<Organization | null>(null);
  const loadViews = useCallback(async () => {
    try {
      const saved = await request("/api/admin/crm/views");
      setViews(saved.items ?? []);
      setViewsFailed(false);
    } catch {
      // Never fall back to a count of zero: that reads as "you have saved no
      // views" when the truth is that we could not ask.
      setViewsFailed(true);
    }
  }, []);
  // Deferred by a zero-delay timer so the first fetch never resolves inside the
  // effect body, the same idiom the pipeline list uses.
  useEffect(() => {
    const timer = window.setTimeout(() => void loadViews(), 0);
    return () => window.clearTimeout(timer);
  }, [loadViews]);
  async function mutate(path: string, body?: unknown, method = "POST") {
    setMessage("");
    try {
      await request(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      setMessage("CRM change saved and audited.");
      await loadViews();
    } catch {
      setMessage("The CRM change was not saved. Reload and try again.");
    }
  }
  async function saveView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate("/api/admin/crm/views", {
      name: String(data.get("name") ?? ""),
      filter: { stages: stage ? [stage] : [], owner_id: owner, query },
    });
  }
  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate("/api/admin/crm/organizations", {
      name: String(data.get("name") ?? ""),
      website: String(data.get("website") ?? ""),
      country_code: String(data.get("country_code") ?? ""),
    });
    form.reset();
  }
  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate("/api/admin/crm/contacts", {
      organization_id: String(data.get("organization_id") ?? ""),
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
      role: String(data.get("role") ?? ""),
      country_code: String(data.get("country_code") ?? ""),
    });
    form.reset();
  }
  async function lookupContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const email = String(data.get("email") ?? "");
    const phone = String(data.get("phone") ?? "");
    if (email) params.set("email", email);
    if (phone) params.set("phone", phone);
    setMessage("");
    try {
      const contact = await request(`/api/admin/crm/contacts/lookup?${params}`);
      setFoundContact(contact);
      setMessage("Matching contact found using normalized details.");
    } catch {
      setFoundContact(null);
      setMessage("No matching contact was found.");
    }
  }
  async function lookupOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams({
      name: String(data.get("name") ?? ""),
    });
    setMessage("");
    try {
      const organization = await request(
        `/api/admin/crm/organizations/lookup?${params}`,
      );
      setFoundOrganization(organization);
      setMessage("Matching organization found using its canonical name.");
    } catch {
      setFoundOrganization(null);
      setMessage("No matching organization was found.");
    }
  }
  // Spelled out because the list that produced these filters is no longer on
  // screen to read them off, and a saved view is hard to correct later.
  const stageName = stages.includes(stage as Stage)
    ? stageLabels[stage as Stage]
    : stage;
  const carried = [
    query ? `search "${query}"` : "",
    stage ? `stage ${stageName}` : "",
    owner ? `owner ${owner}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <section className={styles.tools} aria-labelledby="crm-tools-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Who wants to book Joe</p>
          <h2 id="crm-tools-heading">CRM tools</h2>
          <p className="stage-head__lede">
            Create or locate contacts and organizations, or save this filtered
            view.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.back} href="/admin/crm">
            Back to enquiries
          </Link>
        </div>
      </header>
      {message ? <p role="status">{message}</p> : null}
      <div className={styles.saved}>
        <form className={styles.actions} onSubmit={saveView}>
          <label>
            Saved view name
            <input name="name" required />
          </label>
          <button type="submit">Save current view</button>
          <span>
            {viewsFailed
              ? "Saved view count unavailable"
              : views
                ? `${views.length} saved views`
                : "Counting saved views…"}
          </span>
        </form>
        <p className={styles.muted}>
          {carried
            ? `Saves the filters the list was using: ${carried}.`
            : "The list was unfiltered, so this view covers every enquiry."}
        </p>
      </div>
      <div className={styles.grid}>
        <form className={styles.panel} onSubmit={createOrganization}>
          <h3>Add organization</h3>
          <label>
            Name
            <input name="name" required minLength={2} />
          </label>
          <label>
            HTTPS website
            <input name="website" type="url" />
          </label>
          <label>
            Country code
            <input name="country_code" maxLength={2} />
          </label>
          <button type="submit">Create organization</button>
        </form>
        <form className={styles.panel} onSubmit={createContact}>
          <h3>Add contact</h3>
          <label>
            Name
            <input name="name" required minLength={2} />
          </label>
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Phone
            <input name="phone" type="tel" />
          </label>
          <label>
            Organization ID
            <input name="organization_id" />
          </label>
          <label>
            Role
            <input name="role" />
          </label>
          <label>
            Country code
            <input name="country_code" maxLength={2} />
          </label>
          <button type="submit">Create contact</button>
        </form>
        <form className={styles.panel} onSubmit={lookupOrganization}>
          <h3>Find organization</h3>
          <p className={styles.muted}>
            Spacing and letter case are normalized before matching.
          </p>
          <label>
            Organization name
            <input name="name" required minLength={2} />
          </label>
          <button type="submit">Find canonical match</button>
          {foundOrganization ? (
            <p>
              <strong>{foundOrganization.name}</strong>
              <br />
              {foundOrganization.website}
            </p>
          ) : null}
        </form>
        <form className={styles.panel} onSubmit={lookupContact}>
          <h3>Find contact</h3>
          <p className={styles.muted}>
            Email and phone are normalized before matching.
          </p>
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Phone
            <input name="phone" type="tel" />
          </label>
          <button type="submit">Find normalized match</button>
          {foundContact ? (
            <p>
              <strong>{foundContact.name}</strong>
              <br />
              {foundContact.email || foundContact.phone}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
