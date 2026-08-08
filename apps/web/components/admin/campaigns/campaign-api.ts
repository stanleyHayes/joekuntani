/**
 * Shared campaign types and transport.
 *
 * The new-campaign form and the campaign detail view moved out of dialogs and
 * onto their own routes, so the list and those pages are separate trees that
 * still speak to the same endpoints. This module is what they share.
 */

export type Campaign = {
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

export type Deliverable = {
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

export const campaignStatuses = [
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
];

export const deliverableStatuses = [
  "pending",
  "in_progress",
  "submitted",
  "approved",
  "published",
];

export const approvalStatuses = ["pending", "approved", "rejected"];

export const currencies = ["GHS", "USD", "EUR", "GBP"];

/** Where a campaign's own page lives. `new` is a campaign that has no id yet. */
export function campaignHref(id: string) {
  return `/admin/campaigns/${id ? encodeURIComponent(id) : "new"}`;
}

export function splitValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function request(path: string, init: RequestInit = {}) {
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
