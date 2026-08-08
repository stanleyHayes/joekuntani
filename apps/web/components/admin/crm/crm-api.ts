/**
 * Shared CRM vocabulary and transport.
 *
 * The tools forms and the per-enquiry workflow moved out of dialogs and onto
 * their own routes, so the pipeline list and its two editors are now separate
 * route trees speaking to the same endpoints. This module is what they share.
 */

export const stages = [
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

export type Stage = (typeof stages)[number];

export const stageLabels: Record<Stage, string> = {
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

export type Enquiry = {
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

export type View = {
  id: string;
  name: string;
  filter: {
    stages?: Stage[];
    owner_id?: string;
    source?: string;
    query?: string;
  };
};

export type Contact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  organization_id?: string;
};

export type Organization = { id: string; name: string; website?: string };

/** What the pipeline list is filtered by, and what a saved view records. */
export type PipelineFilters = { query: string; stage: string; owner: string };

export async function request(path: string, init: RequestInit = {}) {
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

/**
 * Where the CRM tools live. The active filters ride in the query string
 * because "save current view" saves what the list was showing, and from the
 * tools page the list is no longer on screen to read them off.
 */
export function crmToolsHref(filters: PipelineFilters) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.owner) params.set("owner_id", filters.owner);
  const search = params.toString();
  return `/admin/crm/tools${search ? `?${search}` : ""}`;
}

/** Where the notes, tasks and proposals for one enquiry live. */
export function enquiryHref(id: string) {
  return `/admin/crm/enquiries/${encodeURIComponent(id)}`;
}
