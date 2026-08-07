"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "../../ui/empty-state";
import { Select } from "../../ui/select";
import { AdminDialog } from "../admin-dialog";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { EnquiryWorkflow } from "../crm-workflow/enquiry-workflow";
import styles from "./crm-workspace.module.css";

const stages = [
  "new",
  "reviewing",
  "qualified",
  "call_scheduled",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "archived",
] as const;
type Stage = (typeof stages)[number];
const stageLabels: Record<Stage, string> = {
  new: "New",
  reviewing: "Reviewing",
  qualified: "Qualified",
  call_scheduled: "Call Scheduled",
  proposal_sent: "Proposal Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
};
type Enquiry = {
  id: string;
  reference: string;
  source: string;
  enquiry_type: string;
  summary: string;
  stage: Stage;
  owner_id: string;
  contact_id: string;
  organization_id: string;
  service_id: string;
  deleted_at?: string;
};
type View = {
  id: string;
  name: string;
  filter: {
    stages?: Stage[];
    owner_id?: string;
    source?: string;
    query?: string;
  };
};
type Contact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  organization_id?: string;
};
type Organization = { id: string; name: string; website?: string };

export function CRMWorkspace() {
  const [items, setItems] = useState<Enquiry[]>([]),
    [views, setViews] = useState<View[]>([]);
  const [query, setQuery] = useState(""),
    [stage, setStage] = useState(""),
    [owner, setOwner] = useState("");
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [foundContact, setFoundContact] = useState<Contact | null>(null);
  const [foundOrganization, setFoundOrganization] =
    useState<Organization | null>(null);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const activeFilters = [query, stage, owner].filter(Boolean).length;
  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (stage) params.set("stage", stage);
      if (owner) params.set("owner_id", owner);
      const [enquiries, saved] = await Promise.all([
        request(`/api/admin/crm/enquiries?${params}`),
        request("/api/admin/crm/views"),
      ]);
      setItems(enquiries.items ?? []);
      setViews(saved.items ?? []);
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
          <button type="button" onClick={() => setToolsOpen(true)}>
            Open CRM tools
          </button>
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
      {toolsOpen ? (
        <AdminDialog
          title="CRM tools"
          description="Create or locate contacts and organizations, or save this filtered view."
          onClose={() => setToolsOpen(false)}
          wide
        >
          <form className={styles.actions} onSubmit={saveView}>
            <label>
              Saved view name
              <input name="name" required />
            </label>
            <button type="submit">Save current view</button>
            <span>{views.length} saved views</span>
          </form>
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
        </AdminDialog>
      ) : null}
      {error ? <AdminErrorState title="CRM is unavailable" message={error} /> : null}
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
                    <button
                      type="button"
                      onClick={() => setSelectedEnquiry(item)}
                    >
                      Open notes, tasks and proposals
                    </button>
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
      {selectedEnquiry ? (
        <AdminDialog
          title={`Enquiry ${selectedEnquiry.reference}`}
          description="Manage notes, tasks, attachments, and proposals."
          onClose={() => setSelectedEnquiry(null)}
          wide
        >
          <EnquiryWorkflow
            key={selectedEnquiry.id}
            enquiryId={selectedEnquiry.id}
          />
        </AdminDialog>
      ) : null}
    </section>
  );
}

async function request(path: string, init: RequestInit = {}) {
  const csrf = cookie("jk_admin_csrf");
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.method && init.method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error("request failed");
  return response.status === 204 ? {} : response.json();
}
function cookie(name: string) {
  return (
    document.cookie
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}
