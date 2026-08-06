"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ContentDraft,
  ContentItem,
  ContentKind,
} from "../../content/types";
import { DateField } from "../../ui/date-field";
import { EmptyState } from "../../ui/empty-state";
import { Select } from "../../ui/select";
import styles from "./content-manager.module.css";

type StaffRole =
  | "administrator"
  | "content_editor"
  | "booking_manager"
  | "analyst";
type MediaOption = {
  id: string;
  filename: string;
  alt_text: string;
  status: string;
};
export type CacheInvalidationRequest = {
  contentID: string;
  revision: number;
  kind: ContentKind;
  slug: string;
  paths: string[];
  tags: string[];
  reason: "publish" | "schedule" | "unpublish";
};
type ContentManagerProps = {
  staffRole?: StaffRole;
  mediaOptions?: MediaOption[];
  requestCacheInvalidation: (
    request: CacheInvalidationRequest,
  ) => Promise<void>;
};

const kinds: { value: ContentKind; label: string }[] = [
  { value: "page", label: "Pages" },
  { value: "portfolio", label: "Portfolio" },
  { value: "video", label: "Videos" },
  { value: "press", label: "Press" },
  { value: "testimonial", label: "Testimonials" },
];
const blank = (kind: ContentKind): ContentDraft => ({
  kind,
  slug: "",
  title: "",
  summary: "",
  body: "",
  category: "",
  tags: [],
  featured: false,
  gallery_asset_ids: [],
  results: [],
  external_url: "",
  embed_url: "",
  outlet: "",
  person_name: "",
  person_title: "",
  organization: "",
  seo: {
    title: "",
    description: "",
    canonical_url: "",
    social_image_asset_id: "",
  },
});

export function ContentManager({
  staffRole = "administrator",
  mediaOptions = [],
  requestCacheInvalidation,
}: ContentManagerProps) {
  const [kind, setKind] = useState<ContentKind>("page");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContentDraft>(blank("page"));
  const [tags, setTags] = useState("");
  const [gallery, setGallery] = useState("");
  const [results, setResults] = useState("[]");
  const [publishAt, setPublishAt] = useState("");
  const [unpublishAt, setUnpublishAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ContentItem | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const selected = useMemo(
    () => items.find((item) => item.id === selectedID),
    [items, selectedID],
  );
  const canApprove = staffRole === "administrator";
  const categories = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((item) => item.category)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [items],
  );
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter(
      (item) =>
        (statusFilter === "all" || item.status === statusFilter) &&
        (categoryFilter === "all" || item.category === categoryFilter) &&
        (!needle ||
          `${item.title} ${item.slug ?? ""} ${item.tags.join(" ")}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
  }, [categoryFilter, items, query, statusFilter]);
  const missingFields = useMemo(() => completeness(draft), [draft]);

  useEffect(() => {
    let current = true;
    void fetch(`/api/admin/content/${kind}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { items?: ContentItem[] };
      })
      .then((body) => {
        if (current) setItems(body.items ?? []);
      })
      .catch(() => {
        if (current) setError("Content could not be loaded. Try again.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [kind]);

  function switchKind(next: ContentKind) {
    setLoading(true);
    setError("");
    setKind(next);
    setSelectedID(null);
    setDraft(blank(next));
    setTags("");
    setGallery("");
    setResults("[]");
    setPreview(null);
    setMessage("");
  }
  function edit(item: ContentItem) {
    setSelectedID(item.id);
    setDraft({
      kind: item.kind,
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      body: item.body,
      category: item.category,
      tags: item.tags,
      featured: item.featured,
      gallery_asset_ids: item.gallery_asset_ids,
      results: item.results,
      external_url: item.external_url,
      embed_url: item.embed_url,
      outlet: item.outlet,
      person_name: item.person_name,
      person_title: item.person_title,
      organization: item.organization,
      seo: item.seo,
    });
    setTags(item.tags.join(", "));
    setGallery(item.gallery_asset_ids.join("\n"));
    setResults(JSON.stringify(item.results, null, 2));
    setPublishAt(item.publish_at ? toLocal(item.publish_at) : "");
    setUnpublishAt(item.unpublish_at ? toLocal(item.unpublish_at) : "");
    setPreview(null);
    setMessage("");
  }
  function newItem() {
    setSelectedID(null);
    setDraft(blank(kind));
    setTags("");
    setGallery("");
    setResults("[]");
    setPublishAt("");
    setUnpublishAt("");
    setPreview(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    let parsedResults: ContentItem["results"];
    try {
      parsedResults = JSON.parse(results) as ContentItem["results"];
      if (!Array.isArray(parsedResults)) throw new Error();
    } catch {
      setError("Results must be a JSON list of label and value objects.");
      return;
    }
    await mutate(
      selectedID
        ? `/api/admin/content/${kind}/${selectedID}`
        : `/api/admin/content/${kind}`,
      selectedID ? "PUT" : "POST",
      {
        ...draft,
        ...(selected ? { revision: selected.revision } : {}),
        tags: split(tags, ","),
        gallery_asset_ids: split(gallery, "\n"),
        results: parsedResults,
      },
      "Draft saved. Editing a published item always returns it to review.",
    );
  }
  async function approval(approved: boolean) {
    if (!selected) return;
    await mutate(
      `/api/admin/content/${kind}/${selected.id}/approval`,
      "PATCH",
      { approved, revision: selected.revision },
      approved ? "Content approved." : "Approval revoked.",
    );
  }
  async function publication(action: "publish" | "schedule" | "unpublish") {
    if (!selected) return;
    const saved = await mutate(
      `/api/admin/content/${kind}/${selected.id}/publication`,
      "PATCH",
      {
        action,
        revision: selected.revision,
        publish_at: publishAt ? new Date(publishAt).toISOString() : "",
        unpublish_at: unpublishAt ? new Date(unpublishAt).toISOString() : "",
      },
      action === "schedule"
        ? "Publication scheduled."
        : action === "publish"
          ? "Content published."
          : "Content unpublished.",
    );
    if (saved) {
      try {
        await requestCacheInvalidation(invalidationFor(saved, action));
        setMessage((current) => `${current} Public cache refresh requested.`);
      } catch {
        setError(
          "Content changed, but the cache refresh request could not be queued. Retry the publication action or contact an administrator.",
        );
      }
    }
  }
  async function loadPreview() {
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/content/${kind}/${selected.id}/preview`,
        { cache: "no-store", credentials: "include" },
      );
      if (!response.ok) throw new Error();
      setPreview((await response.json()) as ContentItem);
    } catch {
      setError("The private preview could not be loaded.");
    } finally {
      setPending(false);
    }
  }
  async function mutate(
    url: string,
    method: string,
    body: unknown,
    success: string,
  ): Promise<ContentItem | null> {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: mutationHeaders(),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new MutationError(response.status);
      const saved = (await response.json()) as ContentItem;
      setItems((current) => {
        const next = current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved];
        return next;
      });
      edit(saved);
      setMessage(success);
      return saved;
    } catch (cause) {
      setError(
        cause instanceof MutationError && cause.status === 409
          ? "This item changed in another session. Reload the content type before editing again."
          : cause instanceof MutationError && cause.status === 403
            ? "Your role cannot perform this action. Ask an administrator for approval or publication."
            : "The content change was not accepted. Check the fields, approval, and schedule.",
      );
      return null;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.manager}>
      <section className={styles.panel} aria-labelledby="content-list-title">
        <h2 id="content-list-title">Content library</h2>
        <p className={styles.help}>
          Drafts never appear publicly. Approval and publication are separate
          controls.
        </p>
        <nav
          className={styles.workspaceLinks}
          aria-label="Content workspace sections"
        >
          <Link href="/admin/services">Services</Link>
          <Link href="/admin/media">Full media library</Link>
        </nav>
        <p className={styles.permission} role="status">
          {staffRole === "administrator"
            ? "Administrator: editing, approval, scheduling and publication are available. Every accepted mutation is audited."
            : staffRole === "content_editor"
              ? "Content editor: create and edit drafts. Administrator approval and publication are required. Every accepted mutation is audited."
              : "Your permissions are being verified. The server authorizes every action."}
        </p>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            Content type
            <Select
              aria-label="Content type"
              value={kind}
              onChange={(value) => switchKind(value as ContentKind)}
              options={kinds.map((item) => ({
                value: item.value,
                label: item.label,
              }))}
            />
          </label>
          <button disabled={pending} onClick={newItem} type="button">
            New draft
          </button>
        </div>
        <div className={styles.filters} aria-label="Content filters">
          <Field
            label="Search title, slug or tag"
            value={query}
            onChange={setQuery}
          />
          <label className={styles.field}>
            Status
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "scheduled", label: "Scheduled" },
                { value: "published", label: "Published" },
                { value: "unpublished", label: "Unpublished" },
              ]}
              aria-label="Status filter"
            />
          </label>
          <label className={styles.field}>
            Filter by category
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All categories" },
                ...categories.map((category) => ({
                  value: category,
                  label: category,
                })),
              ]}
              aria-label="Category filter"
            />
          </label>
        </div>
        {loading ? (
          <p role="status">Loading content…</p>
        ) : visibleItems.length ? (
          <ul className={styles.list}>
            {visibleItems.map((item) => (
              <li className={styles.item} key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {item.status} ·{" "}
                    {item.approved ? "approved" : "approval required"}
                  </span>
                  {item.slug ? <span>/{item.slug}</span> : null}
                </div>
                <button onClick={() => edit(item)} type="button">
                  Edit
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            tone={items.length ? "search" : "stage"}
            title={
              items.length
                ? "Nothing matches these filters"
                : `No ${kind} pieces yet`
            }
            description={
              items.length
                ? "Widen the filters or clear the search to see drafts and published items again."
                : "Start a draft in the editor. Approval and publish keep unsupported claims out of the public site."
            }
          />
        )}
      </section>
      <section className={styles.panel} aria-labelledby="content-editor-title">
        <h2 id="content-editor-title">
          {selected ? `Edit ${selected.title}` : `New ${kind} draft`}
        </h2>
        {missingFields.length ? (
          <p className={styles.warning} role="status">
            Content incomplete: add {missingFields.join(", ")} before requesting
            approval.
          </p>
        ) : null}
        <form className={styles.form} onSubmit={save}>
          <div className={styles.fields}>
            {(kind === "page" || kind === "portfolio") && !selected ? (
              <Field
                label="Immutable slug"
                value={draft.slug ?? ""}
                onChange={(slug) => setDraft({ ...draft, slug })}
                required
              />
            ) : null}
            <Field
              label="Title"
              value={draft.title}
              onChange={(title) => setDraft({ ...draft, title })}
              required
            />
            <Field
              label="Summary"
              value={draft.summary ?? ""}
              onChange={(summary) => setDraft({ ...draft, summary })}
              multiline
            />
            <Field
              label="Body"
              value={draft.body ?? ""}
              onChange={(body) => setDraft({ ...draft, body })}
              multiline
            />
            <Field
              label="Category"
              value={draft.category ?? ""}
              onChange={(category) => setDraft({ ...draft, category })}
              required={kind === "portfolio"}
            />
            <Field
              label="Tags, comma separated"
              value={tags}
              onChange={setTags}
            />
            <Field
              label="Gallery asset UUIDs, one per line"
              value={gallery}
              onChange={setGallery}
              multiline
            />
            {mediaOptions.some((asset) => asset.status === "ready") ? (
              <label className={styles.field}>
                Add approved media
                <Select
                  value=""
                  placeholder="Choose a ready asset…"
                  onChange={(id) => {
                    if (id && !split(gallery, "\n").includes(id))
                      setGallery(
                        [gallery.trim(), id].filter(Boolean).join("\n"),
                      );
                  }}
                  options={mediaOptions
                    .filter((asset) => asset.status === "ready")
                    .map((asset) => ({
                      value: asset.id,
                      label: `${asset.filename} — ${asset.alt_text}`,
                    }))}
                  aria-label="Add approved media"
                />
              </label>
            ) : null}
            <Field
              label="Results JSON"
              value={results}
              onChange={setResults}
              multiline
            />
            {kind === "video" || kind === "press" ? (
              <Field
                label="Verified external HTTPS URL"
                value={draft.external_url ?? ""}
                onChange={(external_url) =>
                  setDraft({ ...draft, external_url })
                }
                required
              />
            ) : null}
            {kind === "video" ? (
              <Field
                label="Approved HTTPS embed URL"
                value={draft.embed_url ?? ""}
                onChange={(embed_url) => setDraft({ ...draft, embed_url })}
                required
              />
            ) : null}
            {kind === "press" ? (
              <Field
                label="Outlet"
                value={draft.outlet ?? ""}
                onChange={(outlet) => setDraft({ ...draft, outlet })}
                required
              />
            ) : null}
            {kind === "testimonial" ? (
              <>
                <Field
                  label="Person name"
                  value={draft.person_name ?? ""}
                  onChange={(person_name) =>
                    setDraft({ ...draft, person_name })
                  }
                  required
                />
                <Field
                  label="Person title"
                  value={draft.person_title ?? ""}
                  onChange={(person_title) =>
                    setDraft({ ...draft, person_title })
                  }
                />
                <Field
                  label="Organization"
                  value={draft.organization ?? ""}
                  onChange={(organization) =>
                    setDraft({ ...draft, organization })
                  }
                />
              </>
            ) : null}
            <label>
              <input
                checked={draft.featured}
                onChange={(event) =>
                  setDraft({ ...draft, featured: event.target.checked })
                }
                type="checkbox"
              />{" "}
              Featured
            </label>
            <Field
              label="SEO title"
              value={draft.seo.title}
              onChange={(title) =>
                setDraft({ ...draft, seo: { ...draft.seo, title } })
              }
            />
            <Field
              label="SEO description"
              value={draft.seo.description}
              onChange={(description) =>
                setDraft({ ...draft, seo: { ...draft.seo, description } })
              }
              multiline
            />
            <Field
              label="Canonical HTTPS URL"
              value={draft.seo.canonical_url}
              onChange={(canonical_url) =>
                setDraft({ ...draft, seo: { ...draft.seo, canonical_url } })
              }
            />
            <Field
              label="Social image asset UUID"
              value={draft.seo.social_image_asset_id}
              onChange={(social_image_asset_id) =>
                setDraft({
                  ...draft,
                  seo: { ...draft.seo, social_image_asset_id },
                })
              }
            />
          </div>
          <button disabled={pending} type="submit">
            Save draft
          </button>
        </form>
        {selected ? (
          <div
            className={styles.actions}
            aria-label="Approval and publication controls"
          >
            <button
              disabled={pending || !canApprove || missingFields.length > 0}
              onClick={() => void approval(!selected.approved)}
              type="button"
            >
              {selected.approved ? "Revoke approval" : "Approve"}
            </button>
            <button
              disabled={pending}
              onClick={() => void loadPreview()}
              type="button"
            >
              Private preview
            </button>
            <button
              disabled={
                pending ||
                !canApprove ||
                !selected.approved ||
                missingFields.length > 0
              }
              onClick={() => void publication("publish")}
              type="button"
            >
              Publish now
            </button>
            <button
              disabled={pending || !canApprove}
              onClick={() => void publication("unpublish")}
              type="button"
            >
              Unpublish
            </button>
          </div>
        ) : null}
        {selected ? (
          <div className={styles.schedule}>
            <Field
              label="Publish at"
              type="datetime-local"
              value={publishAt}
              onChange={setPublishAt}
            />
            <Field
              label="Optional unpublish at"
              type="datetime-local"
              value={unpublishAt}
              onChange={setUnpublishAt}
            />
            <button
              disabled={
                pending ||
                !canApprove ||
                !selected.approved ||
                !publishAt ||
                missingFields.length > 0
              }
              onClick={() => void publication("schedule")}
              type="button"
            >
              Schedule
            </button>
          </div>
        ) : null}
        {selected ? (
          <dl className={styles.audit} aria-label="Content audit context">
            <div>
              <dt>Revision</dt>
              <dd>{selected.revision}</dd>
            </div>
            <div>
              <dt>Last recorded change</dt>
              <dd>{new Date(selected.updated_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd>{selected.approved ? "Approved" : "Required"}</dd>
            </div>
          </dl>
        ) : null}
        {message ? (
          <p className={styles.message} role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className={`${styles.message} ${styles.error}`} role="alert">
            {error}
          </p>
        ) : null}
        {preview ? (
          <article className={styles.preview} aria-labelledby="preview-title">
            <p className="eyebrow">Private preview · not public</p>
            <h3 id="preview-title">{preview.title}</h3>
            <p>{preview.summary}</p>
            <div>{preview.body}</div>
          </article>
        ) : null}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  required?: boolean;
  type?: string;
}) {
  if (type === "date" || type === "datetime-local") {
    return (
      <label className={styles.field}>
        {label}
        <DateField
          aria-label={label}
          required={required}
          mode={type === "date" ? "date" : "datetime"}
          value={value}
          onChange={onChange}
        />
      </label>
    );
  }
  return (
    <label className={styles.field}>
      {label}
      {multiline ? (
        <textarea
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          required={required}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
function split(value: string, separator: string) {
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean);
}
function toLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function mutationHeaders() {
  const csrf =
    document.cookie
      .split("; ")
      .find((value) => value.startsWith("jk_admin_csrf="))
      ?.slice("jk_admin_csrf=".length) ?? "";
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": decodeURIComponent(csrf),
  };
}

class MutationError extends Error {
  constructor(readonly status: number) {
    super(`Content mutation failed with status ${status}`);
  }
}

function completeness(draft: ContentDraft) {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push("title");
  if (!draft.summary?.trim()) missing.push("summary");
  if (!draft.body?.trim() && draft.kind !== "video") missing.push("body");
  if (draft.kind === "portfolio" && !draft.category?.trim())
    missing.push("category");
  if (draft.kind === "video" && !draft.embed_url?.trim())
    missing.push("embed URL");
  if (draft.kind === "press" && !draft.outlet?.trim()) missing.push("outlet");
  if (draft.kind === "testimonial" && !draft.person_name?.trim())
    missing.push("person name");
  return missing;
}

export function invalidationFor(
  item: ContentItem,
  reason: CacheInvalidationRequest["reason"],
): CacheInvalidationRequest {
  const collectionPath =
    item.kind === "portfolio"
      ? "/work"
      : item.kind === "video"
        ? "/videos"
        : item.kind === "press"
          ? "/press"
          : "/";
  const paths = new Set([collectionPath]);
  if (item.slug)
    paths.add(
      item.kind === "portfolio"
        ? `/work/${item.slug}`
        : item.kind === "page"
          ? `/${item.slug}`
          : collectionPath,
    );
  return {
    contentID: item.id,
    revision: item.revision,
    kind: item.kind,
    slug: item.slug ?? "",
    paths: [...paths],
    tags: ["public-content", `content:${item.kind}`, `content:${item.id}`],
    reason,
  };
}
