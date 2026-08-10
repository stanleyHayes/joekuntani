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
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";

import {
  AdminErrorState,
  AdminSkeleton,
  ButtonPending,
  formatAdminTimestamp,
} from "../admin-feedback";
import styles from "./video-admin.module.css";

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
};

const emptyDraft: Draft = {
  title: "",
  slug: "",
  description: "",
  category: "",
  tags: "",
  visibility: "private",
  sortOrder: "0",
};

export function VideoAdmin() {
  const [items, setItems] = useState<VideoItem[] | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
        <p className={styles.summary} aria-live="polite">
          {items?.length ?? 0} videos, {processingCount} processing
        </p>
      </header>

      {error ? (
        <AdminErrorState title="Video action failed" message={error} />
      ) : null}
      {message ? <p className={styles.message}>{message}</p> : null}

      <form className={styles.uploadPanel} onSubmit={submit}>
        <div className={styles.uploadHeading}>
          <UploadSimple size={22} aria-hidden="true" />
          <div>
            <h3>Upload a video</h3>
            <p>
              The browser sends the file directly to Bunny using resumable TUS.
            </p>
          </div>
        </div>
        <div className={styles.formGrid}>
          <label>
            Title
            <input
              required
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </label>
          <label>
            Public slug
            <input
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={draft.slug}
              onChange={(event) =>
                setDraft({ ...draft, slug: event.target.value.toLowerCase() })
              }
            />
          </label>
          <label>
            Category
            <input
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value })
              }
            />
          </label>
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
          <label>
            Visibility
            <select
              value={draft.visibility}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  visibility: event.target.value as Draft["visibility"],
                })
              }
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </label>
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
          <label className={styles.description}>
            Description
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
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
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
                    <input
                      aria-label={`Category for ${item.slug}`}
                      value={item.category}
                      onChange={(event) =>
                        edit(item.id, { category: event.target.value })
                      }
                      placeholder="Category"
                    />
                    <select
                      aria-label={`Visibility for ${item.slug}`}
                      value={item.visibility}
                      onChange={(event) =>
                        edit(item.id, {
                          visibility: event.target
                            .value as VideoItem["visibility"],
                        })
                      }
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
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
          <p className={styles.empty}>
            No videos yet. Upload the first Bunny Stream asset above.
          </p>
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
