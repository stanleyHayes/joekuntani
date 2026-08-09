"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import type {
  ContentDraft,
  ContentItem,
  ContentKind,
} from "@joe-kuntani/shared/types/content";
import { AiAssist, type AiAssistField } from "@joe-kuntani/shared/ui/ai-assist";
import { DateField } from "@joe-kuntani/shared/ui/date-field";
import { Select } from "@joe-kuntani/shared/ui/select";
import { AdminDialog } from "../admin-dialog";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { AssetUploadField, AssetUploadList } from "../media/asset-picker";
import { MarkdownField } from "./markdown-field";
import { SectionsField } from "./sections-field";
import {
  blank,
  completeness,
  contentEditorHref,
  draftOf,
  invalidationFor,
  kindLabel,
  mutationHeaders,
  refreshPublishedContent,
  split,
  toLocal,
  whenLabel,
  type CacheInvalidationRequest,
  type MediaOption,
  type StaffRole,
} from "./content-api";
import styles from "./content-editor.module.css";

/**
 * The content editor, as a page.
 *
 * It used to be a dialog holding around thirty-five controls, which no modal
 * can show at once: the form scrolled inside itself and took its own save
 * button off screen with it. On a page the sections have room, the back button
 * means what it says, and a stray click outside no longer discards a draft.
 *
 * The route is the source of truth for what is being edited — `contentID` of
 * "new" means create — so an operator can link a colleague straight to a draft.
 */
export function ContentEditor({
  kind,
  contentID,
  requestCacheInvalidation = refreshPublishedContent,
}: {
  kind: ContentKind;
  contentID: string;
  requestCacheInvalidation?: (
    request: CacheInvalidationRequest,
  ) => Promise<void>;
}) {
  const router = useRouter();
  const creating = contentID === "new";
  const scheduleID = useId();
  const [role, setRole] = useState<StaffRole | null>(null);
  const [media, setMedia] = useState<MediaOption[]>([]);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [draft, setDraft] = useState<ContentDraft>(() => blank(kind));
  const [tags, setTags] = useState("");
  const [gallery, setGallery] = useState("");
  const [results, setResults] = useState<ContentItem["results"]>([]);
  const [publishAt, setPublishAt] = useState("");
  const [unpublishAt, setUnpublishAt] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ContentItem | null>(null);

  const canApprove = role === "administrator";
  const missingFields = useMemo(() => completeness(draft), [draft]);
  // Saved gallery entries are bare ids; the media list is the only place that
  // knows their URLs, so it resolves the thumbnails for previously-saved images.
  const previewFor = useCallback(
    (assetID: string) =>
      media.find((asset) => asset.id === assetID)?.public_url,
    [media],
  );
  const adopt = useCallback((item: ContentItem) => {
    setSelected(item);
    setDraft(draftOf(item));
    setTags(item.tags.join(", "));
    setGallery(item.gallery_asset_ids.join("\n"));
    setResults(item.results ?? []);
    setPublishAt(item.publish_at ? toLocal(item.publish_at) : "");
    setUnpublishAt(item.unpublish_at ? toLocal(item.unpublish_at) : "");
    setPreview(null);
  }, []);

  // The route is reachable on its own, so the permission check that used to sit
  // on the surrounding workspace has to run here too. Nothing about the item is
  // requested until the role is known.
  useEffect(() => {
    let current = true;
    void fetch("/api/admin/auth/me", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (staffResponse) => {
        if (!staffResponse.ok) throw new Error();
        const staff = (await staffResponse.json()) as { role: StaffRole };
        if (staff.role !== "administrator" && staff.role !== "content_editor") {
          if (current) {
            setRole(staff.role);
            setReady(true);
          }
          return;
        }
        const mediaResponse = await fetch("/api/admin/media", {
          cache: "no-store",
          credentials: "include",
        });
        const mediaBody = mediaResponse.ok
          ? ((await mediaResponse.json()) as { assets?: MediaOption[] })
          : { assets: [] };
        // The collection is the only listing endpoint, so an existing item is
        // found in it rather than fetched by id.
        let found: ContentItem | null = null;
        if (!creating) {
          const itemsResponse = await fetch(`/api/admin/content/${kind}`, {
            cache: "no-store",
            credentials: "include",
          });
          if (!itemsResponse.ok) throw new Error();
          const body = (await itemsResponse.json()) as {
            items?: ContentItem[];
          };
          found =
            (body.items ?? []).find((item) => item.id === contentID) ?? null;
        }
        if (!current) return;
        setRole(staff.role);
        setMedia(mediaBody.assets ?? []);
        if (found) adopt(found);
        else if (!creating) setLoadFailed(true);
        setReady(true);
      })
      .catch(() => {
        if (current)
          setAccessError(
            "This draft could not be opened. Reload the page before editing.",
          );
      });
    return () => {
      current = false;
    };
  }, [adopt, contentID, creating, kind]);

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
      adopt(saved);
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

  async function save(event: FormEvent) {
    event.preventDefault();
    // `kind` stays out of the body: it is already the URL segment the API reads
    // it from, and the request decoder runs DisallowUnknownFields, so sending it
    // as well made every save — create and update, every kind — fail with 400.
    const payload: Partial<ContentDraft> = { ...draft };
    delete payload.kind;
    const saved = await mutate(
      selected
        ? `/api/admin/content/${kind}/${selected.id}`
        : `/api/admin/content/${kind}`,
      selected ? "PUT" : "POST",
      {
        ...payload,
        ...(selected ? { revision: selected.revision } : {}),
        tags: split(tags, ","),
        gallery_asset_ids: split(gallery, "\n"),
        // Blank rows are an operator part-way through typing, not data.
        results: results.filter(
          (entry) => entry.label.trim() || entry.value.trim(),
        ),
      },
      "Draft saved. Editing a published item always returns it to review.",
    );
    // A created item has an id now, so the URL must stop saying `new`.
    // Reloading it otherwise would file a second copy. The editor stays put:
    // approval and publication are decided here, not back on the list.
    if (saved && creating) router.replace(contentEditorHref(kind, saved.id));
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

  if (accessError)
    return (
      <AdminErrorState title="Content is unavailable" message={accessError} />
    );
  if (!ready) return <AdminSkeleton label="Loading draft" variant="page" />;
  if (role !== "administrator" && role !== "content_editor")
    return (
      <AdminErrorState
        title="Content workspace unavailable"
        message="Your role does not include content-management permission. No content or media records were loaded."
        retry={false}
      />
    );
  if (loadFailed)
    return (
      <AdminErrorState
        title="That draft could not be opened"
        message="It may have been removed. Return to the content library and try again."
      />
    );

  const stage = stageOf(selected, missingFields);
  const readyMedia = media.filter((asset) => asset.status === "ready");

  return (
    <section className={styles.editor} aria-labelledby="content-editor-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Content and media</p>
          <h2 id="content-editor-heading">
            {selected
              ? `Edit ${selected.title}`
              : `New ${kindLabel(kind).toLocaleLowerCase()}`}
          </h2>
          <p className="stage-head__lede">
            Drafts never appear publicly. Approval and publication are separate
            controls, and every accepted change is audited.
          </p>
        </div>
        <div className="stage-head__actions">
          <Link className={styles.back} href="/content">
            Back to content
          </Link>
        </div>
      </header>

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

      <form className={styles.form} onSubmit={save}>
        <fieldset className={styles.group}>
          <legend className={styles.legend}>Identity</legend>
          <div className={styles.stack}>
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
            <div className={styles.fieldGrid}>
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
            </div>
            <label className={styles.check}>
              <input
                checked={draft.featured}
                onChange={(event) =>
                  setDraft({ ...draft, featured: event.target.checked })
                }
                type="checkbox"
              />{" "}
              Featured
            </label>
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Copy</legend>
          <div className={styles.stack}>
            <Field
              assist="summary"
              label="Summary"
              value={draft.summary ?? ""}
              onChange={(summary) => setDraft({ ...draft, summary })}
              multiline
            />
            <MarkdownField
              assist="body"
              label="Body"
              hint="Markdown. Use the toolbar or write it directly, then switch to Preview to see exactly what publishes."
              value={draft.body ?? ""}
              onChange={(body) => setDraft({ ...draft, body })}
            />
          </div>
        </fieldset>

        {kind === "video" || kind === "press" || kind === "testimonial" ? (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>
              {kind === "testimonial" ? "Attribution" : "Source"}
            </legend>
            <div className={styles.stack}>
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
                  <div className={styles.fieldGrid}>
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
                  </div>
                </>
              ) : null}
            </div>
          </fieldset>
        ) : null}

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Media</legend>
          <div className={styles.stack}>
            {/* Was a textarea of newline-separated UUIDs. The stored shape
                is unchanged — this just stops an operator having to find
                and copy an id from another screen to add a picture. */}
            <AssetUploadList
              label={
                kind === "page" && draft.slug === "home"
                  ? "Homepage hero & gallery"
                  : kind === "page"
                    ? "Hero & gallery images"
                    : "Gallery images"
              }
              hint={
                kind === "page" && draft.slug === "home"
                  ? "The first image becomes the homepage hero. Recommended: 2400 × 1500 px landscape (8:5), JPG or WebP, with Joe positioned near the centre or right so the title remains readable on the left. Use “Make hero” to promote another image."
                  : kind === "page"
                    ? "The first image is this page's hero — the large picture at the top. Add one, or use “Make hero” to promote another."
                    : "Shown with this item on the public site. The first one is used as its main picture."
              }
              folder="content"
              values={split(gallery, "\n")}
              onChange={(ids) => setGallery(ids.join("\n"))}
              previewFor={previewFor}
              leadBadge={kind === "page" ? "Hero" : "Main"}
            />
            {readyMedia.length ? (
              <label className={styles.field}>
                Or reuse an image already uploaded
                <Select
                  value=""
                  placeholder="Choose from the media library…"
                  onChange={(id) => {
                    if (id && !split(gallery, "\n").includes(id))
                      setGallery(
                        [gallery.trim(), id].filter(Boolean).join("\n"),
                      );
                  }}
                  options={readyMedia.map((asset) => ({
                    value: asset.id,
                    label: `${asset.filename} — ${asset.alt_text}`,
                  }))}
                  aria-label="Reuse an image already uploaded"
                />
              </label>
            ) : null}
          </div>
        </fieldset>

        <SectionsField
          value={draft.sections ?? []}
          onChange={(sections) => setDraft({ ...draft, sections })}
        />
        <ResultsField value={results} onChange={setResults} />

        <fieldset className={styles.group}>
          <legend className={styles.legend}>SEO</legend>
          <div className={styles.stack}>
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
            <AssetUploadField
              label="Sharing image"
              hint="Used when this page is shared on social media."
              folder="content"
              value={draft.seo.social_image_asset_id}
              previewURL={previewFor(draft.seo.social_image_asset_id)}
              onChange={(social_image_asset_id) =>
                setDraft({
                  ...draft,
                  seo: { ...draft.seo, social_image_asset_id },
                })
              }
            />
          </div>
        </fieldset>

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

        {/* One bar, read top to bottom: where the item stands, what is holding
            it back, what can be done about it, and when it is due. It sits
            inside the form so its submit button is the form's own, and it
            sticks to the bottom of the viewport because the fields above it
            are long enough to carry every control off screen otherwise. */}
        <section
          className={styles.bar}
          aria-label="Approval and publication controls"
        >
          <div className={styles.barState}>
            <p className={styles.stage} data-stage={stage}>
              {STAGE_LABEL[stage]}
            </p>
            <p className={styles.blocker} role="status">
              {blockerFor(stage, missingFields, selected, canApprove)}
            </p>
          </div>

          <p className={styles.when}>{scheduleLine(selected)}</p>

          <div className={styles.actions}>
            <button className={styles.save} disabled={pending} type="submit">
              Save draft
            </button>
            <Link className={styles.cancel} href="/content">
              Cancel
            </Link>
            <span className={styles.actionsSplit} aria-hidden="true" />
            {selected ? (
              <>
                {stage === "draft" || stage === "review" ? (
                  <button
                    className={styles.decide}
                    disabled={
                      pending || !canApprove || missingFields.length > 0
                    }
                    onClick={() => void approval(true)}
                    type="button"
                  >
                    Approve
                  </button>
                ) : null}
                {stage === "approved" ||
                stage === "scheduled" ||
                stage === "unpublished" ? (
                  <button
                    className={styles.decide}
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
                ) : null}
                {stage === "approved" || stage === "scheduled" ? (
                  <button
                    aria-controls={scheduleID}
                    aria-expanded={scheduleOpen}
                    className={styles.ghost}
                    onClick={() => setScheduleOpen((open) => !open)}
                    type="button"
                  >
                    Schedule
                  </button>
                ) : null}
                {stage === "scheduled" || stage === "published" ? (
                  <button
                    className={styles.caution}
                    disabled={pending || !canApprove}
                    onClick={() => void publication("unpublish")}
                    type="button"
                  >
                    Unpublish
                  </button>
                ) : null}
                {selected.approved && stage !== "scheduled" ? (
                  <button
                    className={styles.caution}
                    disabled={
                      pending || !canApprove || missingFields.length > 0
                    }
                    onClick={() => void approval(false)}
                    type="button"
                  >
                    Revoke approval
                  </button>
                ) : null}
                <button
                  className={styles.ghost}
                  disabled={pending}
                  onClick={() => void loadPreview()}
                  type="button"
                >
                  Private preview
                </button>
              </>
            ) : null}
          </div>

          {/* Kept behind a disclosure: two date pickers permanently on screen
              said the schedule was the point, when most items are simply
              published now. */}
          {selected && scheduleOpen ? (
            <div className={styles.schedule} id={scheduleID}>
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
                className={styles.ghost}
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
                Confirm schedule
              </button>
            </div>
          ) : null}
        </section>
      </form>

      {preview ? (
        <AdminDialog
          title="Private preview"
          description="This is the draft as it would read. Nothing here is public."
          onClose={() => setPreview(null)}
        >
          <article className={styles.preview} aria-label="Draft preview">
            <h3>{preview.title}</h3>
            <p>{preview.summary}</p>
            <div>{preview.body}</div>
          </article>
        </AdminDialog>
      ) : null}
    </section>
  );
}

type Stage =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "unpublished";

const STAGE_LABEL: Record<Stage, string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved, not live",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Unpublished",
};

/**
 * Where the item stands, as one word an operator can act on.
 *
 * A record carries no "submitted for review" flag, so completeness is what
 * separates a draft still being written from one an administrator can act on.
 */
function stageOf(item: ContentItem | null, missing: string[]): Stage {
  if (!item) return "draft";
  if (item.status === "published") return "published";
  if (item.status === "unpublished") return "unpublished";
  if (item.status === "scheduled") return "scheduled";
  if (item.approved) return "approved";
  return missing.length ? "draft" : "review";
}

/** The single sentence answering "so what has to happen next". */
function blockerFor(
  stage: Stage,
  missing: string[],
  item: ContentItem | null,
  canApprove: boolean,
) {
  if (!item)
    return missing.length
      ? `Add ${listOf(missing)}, then save it.`
      : "Ready to save. Approval and publication open once it exists.";
  if (missing.length)
    return `Add ${listOf(missing)} before it can be approved.`;
  if (!item.approved)
    return canApprove
      ? "Complete and ready for approval."
      : "Complete. An administrator has to approve it before it can go live.";
  if (stage === "scheduled") return "Approved and waiting for its start time.";
  if (stage === "published") return "Live on the public site.";
  if (stage === "unpublished")
    return "Taken down. Publish it again when it is ready.";
  return "Approved. Publish it now or schedule a time.";
}

/** The schedule as a person would say it, not two ISO strings. */
function scheduleLine(item: ContentItem | null) {
  if (!item) return "Not saved yet";
  const parts = [
    item.publish_at ? `Goes live ${whenLabel(item.publish_at)}` : "",
    item.unpublish_at ? `Comes down ${whenLabel(item.unpublish_at)}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No schedule set";
}

function listOf(parts: string[]) {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * The measurable outcomes shown on a case study — "Tickets sold", "12,400".
 *
 * This was a textarea holding raw JSON, so publishing a result meant an editor
 * hand-writing `[{"label":"…","value":"…"}]` and a stray comma failing the save
 * with a parser message. The shape is two strings per row; the editor now says
 * so, and a malformed value is no longer expressible.
 */
function ResultsField({
  value,
  onChange,
}: {
  value: ContentItem["results"];
  onChange: (results: ContentItem["results"]) => void;
}) {
  const rows = value.length ? value : [{ label: "", value: "" }];

  function update(
    index: number,
    patch: Partial<{ label: string; value: string }>,
  ) {
    onChange(
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>
        Results
        <span className={styles.legendHint}>
          — outcomes shown on the published card, e.g. “Tickets sold” / “12,400”
        </span>
      </legend>
      <ul className={styles.resultsRows}>
        {rows.map((row, index) => (
          <li className={styles.resultsRow} key={index}>
            <label className={styles.field}>
              <span>Label {index + 1}</span>
              <input
                value={row.label}
                onChange={(event) =>
                  update(index, { label: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              <span>Value {index + 1}</span>
              <input
                value={row.value}
                onChange={(event) =>
                  update(index, { value: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              className={styles.resultsRemove}
              aria-label={`Remove result ${index + 1}`}
              disabled={rows.length === 1 && !row.label && !row.value}
              onClick={() =>
                onChange(rows.filter((_, position) => position !== index))
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.resultsAdd}
        onClick={() => onChange([...rows, { label: "", value: "" }])}
      >
        Add result
      </button>
    </fieldset>
  );
}

function Field({
  assist,
  label,
  value,
  onChange,
  multiline = false,
  required = false,
  type = "text",
}: {
  /** Attaches the AI copy bar. Multiline fields only — prose, not identifiers. */
  assist?: AiAssistField;
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
  const field = (
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
  // Outside the <label>: a label's accessible name comes from its text
  // content, so an AI bar nested inside would rename the control to
  // "Summary AI Rewrite Expand Shorten…".
  if (!assist || !multiline) return field;
  return (
    <div className={styles.fieldGroup}>
      {field}
      <AiAssist field={assist} label={label} value={value} onApply={onChange} />
    </div>
  );
}

class MutationError extends Error {
  constructor(readonly status: number) {
    super(`Content mutation failed with status ${status}`);
  }
}
