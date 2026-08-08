/**
 * Shared service types and transport.
 *
 * The service editor moved out of a dialog and onto its own page, so the list
 * and the editor are now separate route trees that still speak to the same
 * endpoints. This module is what they share.
 */

import type { PublicService } from "@joe-kuntani/shared/types/services";

/** The editable half of a service. Slug, state and version stay server-owned. */
export type Draft = Omit<
  PublicService,
  | "id"
  | "slug"
  | "state"
  | "version"
  | "retired_at"
  | "created_at"
  | "updated_at"
>;

export const emptyDraft: Draft = {
  name: "",
  summary: "",
  description: "",
  category: "",
  active: false,
  sort_order: 0,
  form_schema: { version: 1, questions: [] },
  cta: { label: "Start an enquiry", href: "/book" },
};

export function csrfCookie() {
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("jk_admin_csrf="))
      ?.slice("jk_admin_csrf=".length) ?? ""
  );
}

export function mutationHeaders() {
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfCookie(),
  };
}

/** Where the editor for a service lives. `new` is a service that has no id yet. */
export function serviceEditorHref(id: string) {
  return `/services/${id ? encodeURIComponent(id) : "new"}`;
}
