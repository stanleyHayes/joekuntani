/**
 * Shared event types and transport.
 *
 * The event editor moved out of a dialog and onto its own page, so the list and
 * the editor are now separate route trees that still speak to the same
 * endpoints. This module is what they share.
 */

export type Status = "draft" | "published" | "cancelled";

export type EventRecord = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: number;
  status: Status;
  banner_asset_id?: string;
  banner: { featured: boolean; starts_at?: string; ends_at?: string };
  venue: {
    name: string;
    address: string;
    city: string;
    country_code: string;
    map_url?: string;
    accessibility?: string;
  };
  policies: {
    refunds: string;
    entry: string;
    age_limit: number;
    age_guidance?: string;
    accessibility?: string;
  };
};

export type Ticket = {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  capacity: number;
  sold: number;
  reserved: number;
  min_per_order: number;
  max_per_order: number;
  sales_start: string;
  sales_end: string;
  paused: boolean;
  status: string;
  sort_order: number;
};

/** The id, slug and lifecycle state are the server's to set, never the form's. */
export type EventDraft = Omit<EventRecord, "id" | "slug" | "status">;

/** Likewise for a ticket: counts and sale state are derived, not submitted. */
export type TicketDraft = Pick<
  Ticket,
  | "name"
  | "description"
  | "price"
  | "currency"
  | "capacity"
  | "min_per_order"
  | "max_per_order"
  | "sales_start"
  | "sales_end"
  | "sort_order"
>;

export const emptyEvent: EventDraft = {
  title: "",
  summary: "",
  description: "",
  starts_at: "",
  ends_at: "",
  timezone: "Africa/Accra",
  capacity: 1,
  banner_asset_id: "",
  banner: { featured: false },
  venue: { name: "", address: "", city: "", country_code: "GH" },
  policies: { refunds: "", entry: "", age_limit: 0 },
};

export const emptyTicket: TicketDraft = {
  name: "",
  description: "",
  price: "",
  currency: "GHS",
  capacity: 1,
  min_per_order: 1,
  max_per_order: 1,
  sales_start: "",
  sales_end: "",
  sort_order: 0,
};

/** Where the editor for an event lives. `new` is an event that has no id yet. */
export function eventEditorHref(id: string) {
  return `/admin/events/${id ? encodeURIComponent(id) : "new"}`;
}

export function mutationHeaders() {
  const token =
    document.cookie.match(/(?:^|; )jk_admin_csrf=([^;]+)/)?.[1] ?? "";
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": decodeURIComponent(token),
  };
}
