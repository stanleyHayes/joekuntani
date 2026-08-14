"use client";

import { Upload } from "tus-js-client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  ArrowClockwise,
  FilmStrip,
  FolderSimplePlus,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { AiAssist } from "@joe-kuntani/shared/ui/ai-assist";
import { Combobox } from "@joe-kuntani/shared/ui/combobox";
import { Select } from "@joe-kuntani/shared/ui/select";

import {
  AdminErrorState,
  AdminSkeleton,
  ButtonPending,
  formatAdminTimestamp,
} from "../admin-feedback";
import { AdminDialog } from "../admin-dialog";
import { AssetUploadField } from "../media/asset-picker";
import styles from "./video-admin.module.css";

/** Declared once: the draft editor and every library row offer the same three. */
const VISIBILITIES = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
] as const;

/**
 * "Automatic" is the empty override, and it is the right answer almost always:
 * Bunny measures the frame during encoding. The fixed shapes are here for the
 * clip that arrived already letterboxed, where the measured frame is a lie.
 */
const ASPECT_RATIOS = [
  { value: "", label: "Automatic" },
  { value: "16:9", label: "16:9 landscape" },
  { value: "9:16", label: "9:16 portrait" },
  { value: "1:1", label: "1:1 square" },
  { value: "4:5", label: "4:5 portrait" },
  { value: "4:3", label: "4:3 classic" },
] as const;

export type VideoItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  provider: string;
  thumbnail_url: string;
  duration_seconds: number;
  status: "uploading" | "processing" | "ready" | "failed" | "archived";
  width?: number;
  height?: number;
  /** Resolved by the API: the override, else the measured frame, else 16:9. */
  aspect_ratio?: string;
  /** The override alone. Empty means "use what Bunny measured". */
  aspect_ratio_override?: string;
  visibility: "public" | "private" | "unlisted";
  is_published: boolean;
  published_at?: string;
  sort_order: number;
  filename: string;
  mime_type: string;
  bytes: number;
  failure_reason?: string;
  revision: number;
  created_at: string;
  updated_at: string;
  playback?: { embed_url: string; hls_url: string; thumbnail_url: string };
};

type UploadAuthorization = {
  endpoint: string;
  signature: string;
  expiration_time: number;
  library_id: string;
  video_id: string;
  filename: string;
  mime_type: string;
};

type Draft = {
  title: string;
  slug: string;
  description: string;
  category: string;
  tags: string;
  visibility: VideoItem["visibility"];
  sortOrder: string;
  aspectRatio: string;
};

type VideoCategory = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image_asset_id: string;
  active: boolean;
  sort_order: number;
  revision: number;
};

type CategoryDraft = {
  title: string;
  description: string;
  image_asset_id: string;
  active: boolean;
  sort_order: string;
};

const emptyDraft: Draft = {
  title: "",
  slug: "",
  description: "",
  category: "",
  tags: "",
  visibility: "private",
  sortOrder: "0",
  aspectRatio: "",
};

const emptyCategoryDraft: CategoryDraft = {
  title: "",
  description: "",
  image_asset_id: "",
  active: true,
  sort_order: "0",
};

export function VideoAdmin() {
  const [items, setItems] = useState<VideoItem[] | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [file, setFile] = useState<File | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [categoryDraft, setCategoryDraft] = useState(emptyCategoryDraft);
  const [categoryItems, setCategoryItems] = useState<VideoCategory[]>([]);
  const [categoryPending, setCategoryPending] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/videos", {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) throw new Error();
    const body = (await response.json()) as { items?: VideoItem[] };
    setItems(uniqueItems(body.items ?? []));
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/videos", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { items?: VideoItem[] };
      })
      .then((body) => {
        if (active) setItems(uniqueItems(body.items ?? []));
      })
      .catch(() => {
        if (active) setError("The video library could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/video-categories", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { items?: VideoCategory[] };
      })
      .then((body) => {
        if (active)
          setCategoryItems((body.items ?? []).filter(isVideoCategory));
      })
      .catch(() => {
        if (active)
          setError(
            (current) => current || "Video categories could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || pending) return;
    setPending("upload");
    setError("");
    setMessage("");
    setProgress(0);
    try {
      const response = await api("/api/admin/videos/uploads", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          slug: draft.slug,
          description: draft.description,
          category: draft.category,
          tags: splitTags(draft.tags),
          visibility: draft.visibility,
          sort_order: Number(draft.sortOrder) || 0,
          aspect_ratio: draft.aspectRatio,
          filename: file.name,
          mime_type: file.type,
          bytes: file.size,
        }),
      });
      const body = (await response.json()) as {
        item?: VideoItem;
        upload?: UploadAuthorization;
      };
      if (!response.ok || !body.item || !body.upload) throw new Error();
      setItems((current) => uniqueItems([body.item!, ...(current ?? [])]));
      await uploadToBunny(file, body.upload, body.item.title, setProgress);
      setMessage("Upload complete. Bunny Stream is processing the video.");
      setDraft(emptyDraft);
      setFile(null);
      // The new row is already in the library behind the dialog, and the
      // confirmation reads on the page itself; leaving the form open would sit
      // over the thing the operator just asked to see.
      setUploadOpen(false);
      await sync(body.item.id);
    } catch {
      setError(
        "The upload could not be completed. The saved record remains visible for recovery.",
      );
    } finally {
      setPending("");
      setProgress(null);
    }
  }

  async function sync(id: string) {
    setPending(`sync:${id}`);
    try {
      const response = await api(
        `/api/admin/videos/${encodeURIComponent(id)}/sync`,
        {
          method: "POST",
        },
      );
      if (!response.ok) throw new Error();
      replaceItem(setItems, (await response.json()) as VideoItem);
    } catch {
      setError("The latest processing state could not be retrieved.");
    } finally {
      setPending("");
    }
  }

  async function publication(item: VideoItem) {
    setPending(`publish:${item.id}`);
    setError("");
    try {
      const response = await api(
        `/api/admin/videos/${encodeURIComponent(item.id)}/publication`,
        {
          method: "PATCH",
          body: JSON.stringify({
            published: !item.is_published,
            revision: item.revision,
          }),
        },
      );
      if (!response.ok) throw new Error();
      replaceItem(setItems, (await response.json()) as VideoItem);
    } catch {
      setError("The publication state could not be changed.");
    } finally {
      setPending("");
    }
  }

  async function save(item: VideoItem) {
    setPending(`save:${item.id}`);
    setError("");
    try {
      const response = await api(
        `/api/admin/videos/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: item.title,
            description: item.description,
            category: item.category,
            tags: item.tags,
            visibility: item.visibility,
            sort_order: item.sort_order,
            aspect_ratio: item.aspect_ratio_override ?? "",
            revision: item.revision,
          }),
        },
      );
      if (!response.ok) throw new Error();
      replaceItem(setItems, (await response.json()) as VideoItem);
      setMessage("Video metadata saved.");
    } catch {
      setError("Video metadata could not be saved.");
    } finally {
      setPending("");
    }
  }

  async function remove(item: VideoItem) {
    if (
      !window.confirm(
        `Delete “${item.title}” from Bunny Stream and this library?`,
      )
    )
      return;
    setPending(`delete:${item.id}`);
    setError("");
    try {
      const response = await api(
        `/api/admin/videos/${encodeURIComponent(item.id)}?revision=${item.revision}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      setItems(
        (current) => current?.filter((video) => video.id !== item.id) ?? [],
      );
      setMessage(
        "Video deleted from Bunny Stream and removed from the library.",
      );
    } catch {
      setError("The video could not be deleted. Nothing was removed locally.");
    } finally {
      setPending("");
    }
  }

  function edit(id: string, patch: Partial<VideoItem>) {
    setItems(
      (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ) ?? [],
    );
  }

  const processingCount = useMemo(
    () =>
      items?.filter(
        (item) => item.status === "processing" || item.status === "uploading",
      ).length ?? 0,
    [items],
  );
  const categories = useMemo(
    () =>
      [
        ...new Set([
          draft.category,
          ...categoryItems
            .filter((category) => category.active)
            .map((category) => category.title),
          ...(items ?? []).map((item) => item.category),
        ]),
      ]
        .map((category) => category.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [categoryItems, draft.category, items],
  );
  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: category, label: category })),
    [categories],
  );

  // The name is passed in when the picker offers to create what was typed into
  // its filter; the "Create category" panel below still supplies its own.
  async function createCategory(proposed?: string) {
    const title = (proposed ?? (categoryDraft.title || newCategory)).trim();
    if (!title || categoryPending) return;
    setCategoryPending("create");
    setError("");
    try {
      const response = await api("/api/admin/video-categories", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: categoryDraft.description,
          image_asset_id: categoryDraft.image_asset_id,
          active: categoryDraft.active,
          sort_order: Number(categoryDraft.sort_order) || categoryItems.length,
        }),
      });
      if (!response.ok) throw new Error();
      const category = (await response.json()) as VideoCategory;
      setCategoryItems((current) => [...current, category]);
      setDraft((current) => ({ ...current, category: category.title }));
      setCategoryDraft(emptyCategoryDraft);
      setNewCategory("");
      setAddingCategory(false);
      setMessage(`Category “${category.title}” created.`);
    } catch {
      setError(
        "The category could not be created. Its title may already exist.",
      );
    } finally {
      setCategoryPending("");
    }
  }

  async function saveCategory(category: VideoCategory) {
    setCategoryPending(category.id);
    setError("");
    try {
      const response = await api(
        `/api/admin/video-categories/${encodeURIComponent(category.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: category.title,
            description: category.description,
            image_asset_id: category.image_asset_id,
            active: category.active,
            sort_order: category.sort_order,
            revision: category.revision,
          }),
        },
      );
      if (!response.ok) throw new Error();
      const updated = (await response.json()) as VideoCategory;
      setCategoryItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(`Category “${updated.title}” saved.`);
    } catch {
      setError("The category could not be saved. Reload and try again.");
    } finally {
      setCategoryPending("");
    }
  }

  if (!items && !error)
    return <AdminSkeleton label="Loading video library" variant="cards" />;

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Bunny Stream</p>
          <h2>Video infrastructure</h2>
          <p>
            Upload once, monitor processing, then publish the ready stream to
            videos or press.
          </p>
        </div>
        <div className={styles.headerAside}>
          <p className={styles.summary} aria-live="polite">
            {items?.length ?? 0} videos, {processingCount} processing
          </p>
          <button
            className={styles.uploadCta}
            type="button"
            onClick={() => setUploadOpen(true)}
          >
            <UploadSimple size={16} aria-hidden="true" />
            Upload a video
          </button>
        </div>
      </header>

      {error ? (
        <AdminErrorState title="Video action failed" message={error} />
      ) : null}
      {message ? <p className={styles.message}>{message}</p> : null}

      <details className={styles.categoryManager}>
        <summary>
          <span>Video categories</span>
          <small>{categoryItems.length} reusable categories</small>
        </summary>
        <div className={styles.categoryGrid}>
          {categoryItems.map((category) => (
            <article className={styles.categoryCard} key={category.id}>
              <AssetUploadField
                label={`${category.title || "Category"} image`}
                hint="Optional cover art for category-led pages and filters."
                folder="video-categories"
                value={category.image_asset_id}
                onChange={(image_asset_id) =>
                  setCategoryItems((current) =>
                    current.map((item) =>
                      item.id === category.id
                        ? { ...item, image_asset_id }
                        : item,
                    ),
                  )
                }
              />
              <label>
                Title
                <input
                  required
                  value={category.title}
                  onChange={(event) =>
                    setCategoryItems((current) =>
                      current.map((item) =>
                        item.id === category.id
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  value={category.description}
                  onChange={(event) =>
                    setCategoryItems((current) =>
                      current.map((item) =>
                        item.id === category.id
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <div className={styles.categoryMetaFields}>
                <label>
                  Order
                  <input
                    inputMode="numeric"
                    value={category.sort_order}
                    onChange={(event) =>
                      setCategoryItems((current) =>
                        current.map((item) =>
                          item.id === category.id
                            ? {
                                ...item,
                                sort_order: Number(event.target.value) || 0,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className={styles.activeToggle}>
                  <input
                    type="checkbox"
                    checked={category.active}
                    onChange={(event) =>
                      setCategoryItems((current) =>
                        current.map((item) =>
                          item.id === category.id
                            ? { ...item, active: event.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                  Available to use
                </label>
              </div>
              <button
                type="button"
                disabled={Boolean(categoryPending) || !category.title.trim()}
                onClick={() => void saveCategory(category)}
              >
                {categoryPending === category.id ? "Saving…" : "Save category"}
              </button>
            </article>
          ))}
        </div>
      </details>

      {uploadOpen ? (
        <AdminDialog
          title="Upload a video"
          description="The browser sends the file directly to Bunny using resumable TUS."
          onClose={() => setUploadOpen(false)}
          wide
        >
          <form
            className={styles.uploadPanel}
            id="video-upload"
            onSubmit={submit}
          >
            <div className={styles.formGrid}>
              <label>
                Title
                <input
                  id="video-upload-title"
                  required
                  value={draft.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    setDraft({ ...draft, title, slug: slugify(title) });
                  }}
                />
              </label>
              <label>
                Public slug
                <input
                  aria-label="Public slug"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={draft.slug}
                  readOnly
                  aria-describedby="video-slug-help"
                />
                <small id="video-slug-help">
                  Generated automatically from the title.
                </small>
              </label>
              <div className={styles.categoryField}>
                <div className={styles.categoryPicker}>
                  <span>Category</span>
                  <Combobox
                    aria-label="Category"
                    options={categoryOptions}
                    value={draft.category}
                    onChange={(category) => setDraft({ ...draft, category })}
                    onCreate={(title) => createCategory(title)}
                    createPending={categoryPending === "create"}
                    placeholder="Select a category"
                    searchPlaceholder="Search categories…"
                    emptyMessage="No category matches that."
                  />
                </div>
                {addingCategory ? (
                  <div className={styles.newCategory}>
                    <input
                      aria-label="New category name"
                      autoFocus
                      maxLength={100}
                      placeholder="e.g. Behind the scenes"
                      value={categoryDraft.title || newCategory}
                      onChange={(event) =>
                        setCategoryDraft({
                          ...categoryDraft,
                          title: event.target.value,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createCategory();
                        }
                      }}
                    />
                    <button type="button" onClick={() => void createCategory()}>
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingCategory(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className={styles.addCategory}
                    type="button"
                    onClick={() => setAddingCategory(true)}
                  >
                    <FolderSimplePlus size={15} aria-hidden="true" /> Create
                    category
                  </button>
                )}
              </div>
              <label>
                Tags
                <input
                  value={draft.tags}
                  onChange={(event) =>
                    setDraft({ ...draft, tags: event.target.value })
                  }
                  placeholder="interview, live set"
                />
              </label>
              <div className={styles.visibilityField}>
                <span>Visibility</span>
                <Select
                  aria-label="Visibility"
                  options={VISIBILITIES}
                  value={draft.visibility}
                  onChange={(visibility) =>
                    setDraft({
                      ...draft,
                      visibility: visibility as Draft["visibility"],
                    })
                  }
                  required
                />
              </div>
              <div className={styles.visibilityField}>
                <span>Aspect ratio</span>
                <Select
                  aria-label="Aspect ratio"
                  options={ASPECT_RATIOS}
                  value={draft.aspectRatio}
                  onChange={(aspectRatio) =>
                    setDraft({ ...draft, aspectRatio })
                  }
                  placeholder="Automatic"
                />
                <small>
                  Left automatic, the shape is read from the video itself once
                  Bunny finishes encoding it.
                </small>
              </div>
              <label>
                Order
                <input
                  inputMode="numeric"
                  value={draft.sortOrder}
                  onChange={(event) =>
                    setDraft({ ...draft, sortOrder: event.target.value })
                  }
                />
              </label>
              <div className={styles.description}>
                <label>
                  Description
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </label>
                <AiAssist
                  field="description"
                  label="Video description"
                  value={draft.description}
                  onApply={(description) => setDraft({ ...draft, description })}
                />
              </div>
              <div className={styles.file}>
                <div className={styles.fileHeading}>
                  <span id="video-file-label">Video file</span>
                  <span data-selected={file ? "true" : "false"}>
                    {file ? "Ready to upload" : "Required"}
                  </span>
                </div>
                <label
                  className={styles.filePicker}
                  data-disabled={pending ? "true" : "false"}
                  data-selected={file ? "true" : "false"}
                  htmlFor="video-file"
                >
                  <input
                    required
                    accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
                    aria-labelledby="video-file-label"
                    disabled={Boolean(pending)}
                    id="video-file"
                    type="file"
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <span className={styles.fileIcon} aria-hidden="true">
                    <UploadSimple size={24} weight="bold" />
                  </span>
                  <span className={styles.fileCopy}>
                    <strong>{file ? file.name : "Select a video file"}</strong>
                    <small>
                      {file
                        ? `${formatBytes(file.size)} · ${file.type || "Video file"}`
                        : "MP4, WebM, MOV or MKV"}
                    </small>
                  </span>
                  <span className={styles.fileAction} aria-hidden="true">
                    {file ? "Replace" : "Browse"}
                  </span>
                </label>
              </div>
            </div>
            {progress !== null ? (
              <div
                className={styles.progress}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <span style={{ transform: `scaleX(${progress / 100})` }} />
              </div>
            ) : null}
            <button
              className={styles.primary}
              disabled={!file || Boolean(pending)}
              type="submit"
            >
              {pending === "upload" ? (
                <>
                  <ButtonPending label={`Uploading ${progress ?? 0}%`} />
                  Uploading {progress ?? 0}%
                </>
              ) : (
                "Start resumable upload"
              )}
            </button>
          </form>
        </AdminDialog>
      ) : null}

      <section aria-labelledby="video-library-title">
        <div className={styles.libraryHeading}>
          <h3 id="video-library-title">Video library</h3>
          <button
            type="button"
            onClick={() => {
              setError("");
              void load().catch(() =>
                setError("The video library could not be loaded."),
              );
            }}
          >
            <ArrowClockwise size={16} aria-hidden="true" /> Reload
          </button>
        </div>
        {items?.length ? (
          <div className={styles.grid}>
            {items.map((item) => (
              <article className={styles.card} key={item.id}>
                <div className={styles.poster}>
                  {item.thumbnail_url ? (
                    // Bunny poster hosts are library-configured at runtime.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail_url}
                      alt=""
                      width={960}
                      height={540}
                    />
                  ) : (
                    <FilmStrip size={36} aria-hidden="true" />
                  )}
                  <span data-state={item.status}>{item.status}</span>
                </div>
                <div className={styles.cardBody}>
                  <input
                    aria-label={`Title for ${item.slug}`}
                    value={item.title}
                    onChange={(event) =>
                      edit(item.id, { title: event.target.value })
                    }
                  />
                  <textarea
                    aria-label={`Description for ${item.slug}`}
                    value={item.description}
                    onChange={(event) =>
                      edit(item.id, { description: event.target.value })
                    }
                  />
                  <div className={styles.inlineFields}>
                    {/* Choose, never invent. This row used to be free text, so
                        a category the picker above was careful to keep single
                        could be re-spelled into a second one from here. */}
                    <Combobox
                      aria-label={`Category for ${item.slug}`}
                      options={categoryOptions}
                      value={item.category}
                      onChange={(category) => edit(item.id, { category })}
                      placeholder="Category"
                      searchPlaceholder="Search categories…"
                      emptyMessage="No category matches that."
                    />
                    <Select
                      aria-label={`Visibility for ${item.slug}`}
                      options={VISIBILITIES}
                      value={item.visibility}
                      onChange={(visibility) =>
                        edit(item.id, {
                          visibility: visibility as VideoItem["visibility"],
                        })
                      }
                      required
                    />
                    {/* Here the measured frame is known, so "Automatic" can say
                        what it resolved to rather than leaving the operator to
                        guess what the page will reserve. */}
                    <Select
                      aria-label={`Aspect ratio for ${item.slug}`}
                      options={ASPECT_RATIOS.map((option) =>
                        option.value === "" && item.aspect_ratio
                          ? {
                              value: "",
                              label: `Automatic (${item.aspect_ratio})`,
                            }
                          : option,
                      )}
                      value={item.aspect_ratio_override ?? ""}
                      onChange={(aspect_ratio_override) =>
                        edit(item.id, { aspect_ratio_override })
                      }
                      placeholder="Automatic"
                    />
                  </div>
                  <input
                    aria-label={`Tags for ${item.slug}`}
                    value={item.tags.join(", ")}
                    onChange={(event) =>
                      edit(item.id, { tags: splitTags(event.target.value) })
                    }
                    placeholder="Tags"
                  />
                  <p className={styles.meta}>
                    {item.provider} · {formatBytes(item.bytes)} · revision{" "}
                    {item.revision}
                  </p>
                  <p className={styles.meta}>
                    Created {formatAdminTimestamp(item.created_at)}
                    {item.published_at
                      ? ` · Published ${formatAdminTimestamp(item.published_at)}`
                      : " · Not published"}
                  </p>
                  {item.failure_reason ? (
                    <p className={styles.failure}>{item.failure_reason}</p>
                  ) : null}
                  {item.status === "ready" && item.playback?.embed_url ? (
                    <iframe
                      className={styles.preview}
                      loading="lazy"
                      src={item.playback.embed_url}
                      title={`Preview ${item.title}`}
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                    />
                  ) : null}
                  <div className={styles.actions}>
                    <button
                      disabled={Boolean(pending)}
                      type="button"
                      onClick={() => void save(item)}
                    >
                      <ActionLabel
                        pending={pending === `save:${item.id}`}
                        label="Save metadata"
                        pendingLabel="Saving"
                      />
                    </button>
                    <button
                      disabled={Boolean(pending)}
                      type="button"
                      onClick={() => void sync(item.id)}
                    >
                      <ActionLabel
                        pending={pending === `sync:${item.id}`}
                        label={
                          item.status === "failed"
                            ? "Retry status check"
                            : "Check processing"
                        }
                        pendingLabel="Checking"
                      />
                    </button>
                    <button
                      disabled={
                        Boolean(pending) ||
                        (item.status !== "ready" && !item.is_published)
                      }
                      type="button"
                      onClick={() => void publication(item)}
                    >
                      <ActionLabel
                        pending={pending === `publish:${item.id}`}
                        label={item.is_published ? "Unpublish" : "Publish"}
                        pendingLabel="Updating"
                      />
                    </button>
                    <button
                      className={styles.danger}
                      disabled={Boolean(pending)}
                      type="button"
                      onClick={() => void remove(item)}
                    >
                      <Trash size={15} aria-hidden="true" />
                      <ActionLabel
                        pending={pending === `delete:${item.id}`}
                        label="Delete"
                        pendingLabel="Deleting"
                      />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <FilmStrip size={30} weight="duotone" />
            </span>
            <div>
              <h4>Your video library is ready</h4>
              <p>
                Add the first video, follow its processing status here, then
                publish it when the stream is ready.
              </p>
            </div>
            <button type="button" onClick={() => setUploadOpen(true)}>
              Upload your first video
            </button>
            <ol aria-label="Video publishing steps">
              <li>Choose a category</li>
              <li>Upload to Bunny</li>
              <li>Review and publish</li>
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}

function csrfCookie() {
  const prefix = "jk_admin_csrf=";
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : "";
}
async function api(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfCookie(),
      ...init.headers,
    },
  });
}
function splitTags(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}
export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function isVideoCategory(value: VideoCategory) {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.slug === "string" &&
      typeof value.title === "string" &&
      typeof value.active === "boolean",
  );
}
export function uniqueItems(items: VideoItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
function replaceItem(
  setter: Dispatch<SetStateAction<VideoItem[] | null>>,
  item: VideoItem,
) {
  setter(
    (current) =>
      current?.map((entry) => (entry.id === item.id ? item : entry)) ?? [item],
  );
}
function ActionLabel({
  label,
  pending,
  pendingLabel,
}: {
  label: string;
  pending: boolean;
  pendingLabel: string;
}) {
  return pending ? (
    <>
      <ButtonPending label={pendingLabel} />
      {pendingLabel}
    </>
  ) : (
    label
  );
}
function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function uploadToBunny(
  file: File,
  authorization: UploadAuthorization,
  title: string,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: authorization.endpoint,
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: 10 * 1024 * 1024,
      metadata: {
        filename: authorization.filename,
        filetype: authorization.mime_type,
        title,
      },
      headers: {
        AuthorizationSignature: authorization.signature,
        AuthorizationExpire: String(authorization.expiration_time),
        LibraryId: authorization.library_id,
        VideoId: authorization.video_id,
      },
      removeFingerprintOnSuccess: true,
      onError: reject,
      onProgress: (uploaded, total) =>
        onProgress(total ? Math.round((uploaded / total) * 100) : 0),
      onSuccess: () => resolve(),
    });
    void upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(reject);
  });
}
