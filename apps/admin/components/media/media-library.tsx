"use client";

import {
  type ChangeEvent,
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import Image from "next/image";
import {
  ArrowClockwise,
  CheckCircle,
  FileArrowUp,
  FilePdf,
  FloppyDisk,
  ImageSquare,
  MagnifyingGlass,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";

import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { Select } from "@joe-kuntani/shared/ui/select";
import { AdminDialog } from "../admin-dialog";
import { ButtonPending } from "../admin-feedback";
import styles from "./media-library.module.css";

export type MediaAsset = {
  id: string;
  filename: string;
  mimeType: string;
  publicUrl: string;
  folder: string;
  altText: string;
  tags: string[];
  transformations: string[];
  status: "draft" | "uploading" | "ready" | "failed" | "deleting";
  width: number;
  height: number;
  bytes: number;
  referenceCount: number;
};

type UploadInput = {
  file: File;
  folder: string;
  altText: string;
  tags: string[];
};

export type MediaLibraryProps = {
  initialAssets: MediaAsset[];
  onUpload?: (input: UploadInput) => Promise<MediaAsset>;
  onSave?: (
    id: string,
    input: Pick<MediaAsset, "altText" | "tags" | "transformations">,
  ) => Promise<MediaAsset>;
  onDelete?: (id: string) => Promise<void>;
  onRetry?: (id: string, file: File) => Promise<MediaAsset>;
  /** Re-reads the library. Uploads are confirmed by an out-of-band provider
      callback, so the only way to observe one landing is to ask again. */
  onRefresh?: () => Promise<MediaAsset[] | null>;
};

const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const maxBytes = 10 * 1024 * 1024;

export function MediaLibrary({
  initialAssets,
  onUpload,
  onSave,
  onDelete,
  onRetry,
  onRefresh,
}: MediaLibraryProps) {
  const [assets, setAssets] = useState(initialAssets);
  const [selectedID, setSelectedID] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  // Deletion removes the file from the provider as well as the record, so it
  // asks first. Held as the asset rather than a boolean because the card
  // buttons can delete something other than the currently-selected asset.
  const [pendingDelete, setPendingDelete] = useState<MediaAsset | null>(null);
  // A filename alone does not tell you whether you picked the right photo, and
  // the only way to check used to be uploading it. Rendered from the local file,
  // so nothing is sent until the operator submits.
  const [chosen, setChosen] = useState<{
    url: string;
    name: string;
    isImage: boolean;
  } | null>(null);

  // Cleanup closes over the previous entry, so each object URL is released when
  // it is superseded and again when the library unmounts.
  useEffect(() => {
    if (!chosen) return;
    return () => URL.revokeObjectURL(chosen.url);
  }, [chosen]);

  function previewChoice(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setChosen(
      file
        ? {
            url: URL.createObjectURL(file),
            name: file.name,
            isImage: file.type.startsWith("image/"),
          }
        : null,
    );
  }
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const selected = useMemo(
    () => assets.find((asset) => asset.id === selectedID),
    [assets, selectedID],
  );
  const filteredAssets = useMemo(
    () =>
      assets.filter((asset) => {
        const matchesFolder =
          folderFilter === "all" || asset.folder === folderFilter;
        const haystack =
          `${asset.filename} ${asset.altText} ${asset.tags.join(" ")}`.toLowerCase();
        return (
          matchesFolder && (!deferredQuery || haystack.includes(deferredQuery))
        );
      }),
    [assets, deferredQuery, folderFilter],
  );
  const readyCount = useMemo(
    () => assets.filter((asset) => asset.status === "ready").length,
    [assets],
  );
  const pendingCount = useMemo(
    () => assets.filter((asset) => asset.status === "uploading").length,
    [assets],
  );

  async function refresh() {
    if (!onRefresh) return;
    setBusy(true);
    try {
      const latest = await onRefresh();
      if (latest) setAssets(latest);
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fileInput = form.elements.namedItem("file");
    const file =
      fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : undefined;
    const altText = String(data.get("altText") ?? "").trim();
    if (
      !file ||
      file.size === 0 ||
      !allowedTypes.includes(file.type) ||
      file.size > maxBytes ||
      altText.length < 8
    ) {
      setNotice(
        "Choose an approved file under 10 MB and provide descriptive alternative text.",
      );
      return;
    }
    if (!onUpload) {
      setNotice(
        "The media provider is unavailable. Your form values are preserved; try again later.",
      );
      return;
    }
    setBusy(true);
    try {
      const asset = await onUpload({
        file,
        folder: String(data.get("folder")),
        altText,
        tags: splitList(String(data.get("tags") ?? "")),
      });
      setAssets((current) => [asset, ...current]);
      setSelectedID(asset.id);
      setNotice(
        asset.status === "ready"
          ? "Asset uploaded and ready for review."
          : "Draft saved. Provider completion is pending and can be retried.",
      );
      form.reset();
      setChosen(null);
      setUploadOpen(false);
    } catch {
      setNotice(
        "Upload is temporarily unavailable. Your draft metadata has not been discarded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !onSave) return;
    const data = new FormData(event.currentTarget);
    const altText = String(data.get("altText") ?? "").trim();
    if (altText.length < 8) {
      setNotice("Alternative text must meaningfully describe the asset.");
      return;
    }
    setBusy(true);
    try {
      const updated = await onSave(selected.id, {
        altText,
        tags: splitList(String(data.get("tags") ?? "")),
        transformations: splitList(String(data.get("transformations") ?? "")),
      });
      setAssets((current) =>
        current.map((asset) => (asset.id === updated.id ? updated : asset)),
      );
      setNotice("Metadata saved.");
    } catch {
      setNotice("Metadata could not be saved. No changes were lost locally.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(target?: MediaAsset) {
    const asset = target ?? selected;
    if (!asset || !onDelete) return;
    if (asset.referenceCount > 0) {
      setNotice(
        `This asset is used in ${asset.referenceCount} place${asset.referenceCount === 1 ? "" : "s"} and cannot be deleted.`,
      );
      setPendingDelete(null);
      return;
    }
    setBusy(true);
    try {
      await onDelete(asset.id);
      const remaining = assets.filter((item) => item.id !== asset.id);
      setAssets(remaining);
      setSelectedID(remaining[0]?.id ?? "");
      setDetailsOpen(false);
      setNotice("Asset deleted.");
    } catch {
      setNotice("The asset could not be deleted. It remains available.");
    } finally {
      // Dismissed either way: the outcome is reported in the page notice, which
      // sits behind this dialog.
      setPendingDelete(null);
      setBusy(false);
    }
  }
  async function retry() {
    if (!selected || !onRetry || !retryFile) {
      setNotice("Choose the original approved file before retrying.");
      return;
    }
    if (
      retryFile.name !== selected.filename ||
      retryFile.type !== selected.mimeType ||
      retryFile.size !== selected.bytes
    ) {
      setNotice(
        "Choose the same file name, type, and size used for this draft.",
      );
      return;
    }
    setBusy(true);
    try {
      const updated = await onRetry(selected.id, retryFile);
      setAssets((current) =>
        current.map((asset) => (asset.id === updated.id ? updated : asset)),
      );
      setNotice("Secure upload retried. Provider completion is pending.");
    } catch {
      setNotice("The provider is still unavailable. The draft remains saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.library} aria-labelledby="media-title">
      {/* `stage-head`, matching the events and services workspaces: the shared
          `.admin-stage > section > header:not(.stage-head)` rule forces a grid
          on any other header, which is what dropped the upload action below the
          copy instead of pinning it to the right edge. */}
      <header className="stage-head">
        <div className={styles.heading}>
          <span className={styles.headingIcon} aria-hidden="true">
            <ImageSquare size={22} weight="duotone" />
          </span>
          <div className="stage-head__copy">
            <p className="stage-head__eyebrow">Content and media</p>
            <h2 id="media-title">Asset library</h2>
            <p className="stage-head__lede">
              Upload approved images and documents, then maintain descriptions
              and usage metadata.
            </p>
          </div>
        </div>
        <div className="stage-head__actions">
          <button
            type="button"
            className={`primary ${styles.uploadToggle}`}
            aria-expanded={uploadOpen}
            aria-controls="media-upload-panel"
            onClick={() => setUploadOpen((current) => !current)}
          >
            {uploadOpen ? <X size={17} /> : <UploadSimple size={17} />}
            {uploadOpen ? "Close upload" : "Upload asset"}
          </button>
        </div>
      </header>

      <div className={styles.summary} aria-label="Media summary">
        <div>
          <span>Total assets</span>
          <strong>{assets.length}</strong>
        </div>
        <div>
          <span>Ready</span>
          <strong>{readyCount}</strong>
        </div>
        <div>
          <span>Needs attention</span>
          <strong>{assets.length - readyCount}</strong>
        </div>
      </div>

      {notice ? (
        <p className={styles.notice} role="status" aria-live="polite">
          <CheckCircle size={18} weight="fill" aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      {/* An asset sits in `uploading` until the media provider calls back into
          the API to confirm it. That is out of the browser's hands, so say so
          rather than leaving a badge that looks like a hung upload. */}
      {pendingCount > 0 ? (
        <p className={styles.pending}>
          <span>
            {pendingCount} asset{pendingCount === 1 ? " is" : "s are"} waiting
            for the media provider to confirm the transfer. They become usable
            once it does.
          </span>
          {onRefresh ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <ArrowClockwise size={15} aria-hidden="true" />
              Check again
            </button>
          ) : null}
        </p>
      ) : null}

      {uploadOpen ? (
        <AdminDialog
          title="Upload asset"
          description="Add an approved image or document to the media library."
          onClose={() => setUploadOpen(false)}
          wide
        >
          <form
            id="media-upload-panel"
            className={styles.upload}
            onSubmit={upload}
          >
            <div className={styles.uploadIntro}>
              <FileArrowUp size={24} weight="duotone" aria-hidden="true" />
              <div>
                <h3>New asset</h3>
                <p>JPEG, PNG, WebP, or PDF. Maximum file size is 10 MB.</p>
              </div>
            </div>
            <div className={styles.uploadFields}>
              <label className={styles.fileField}>
                File
                <input
                  name="file"
                  type="file"
                  accept={allowedTypes.join(",")}
                  required
                  onChange={previewChoice}
                />
                {chosen ? (
                  <span className={styles.filePreview}>
                    <span
                      className={styles.filePreviewThumb}
                      data-kind={chosen.isImage ? "image" : "file"}
                    >
                      {chosen.isImage ? (
                        // Local blob URL, not a remote asset: next/image cannot
                        // optimise it and there is nothing to optimise.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={chosen.url} alt="" />
                      ) : (
                        <FilePdf
                          size={22}
                          weight="duotone"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className={styles.filePreviewMeta}>
                      <strong>{chosen.name}</strong>
                      <span>
                        {chosen.isImage
                          ? "Preview only — nothing is uploaded until you submit."
                          : "No preview for this file type."}
                      </span>
                    </span>
                  </span>
                ) : null}
              </label>
              <label>
                Folder
                <Select
                  name="folder"
                  defaultValue="content"
                  options={[
                    { value: "content", label: "Content" },
                    { value: "press", label: "Press" },
                    { value: "documents", label: "Documents" },
                  ]}
                  aria-label="Media folder"
                />
              </label>
              <label className={styles.altField}>
                Alternative text
                <span>Describe the visible subject and its purpose.</span>
                <textarea name="altText" required minLength={8} />
              </label>
              <label>
                Tags
                <span>Comma separated</span>
                <input name="tags" />
              </label>
            </div>
            <div className={styles.uploadFooter}>
              <button
                type="submit"
                className={styles.primaryAction}
                disabled={busy}
              >
                <UploadSimple size={17} aria-hidden="true" />
                {busy ? (
                  <ButtonPending label="Uploading asset" />
                ) : (
                  "Request secure upload"
                )}
              </button>
            </div>
          </form>
        </AdminDialog>
      ) : null}

      <div className={styles.assetTools}>
        <label className={styles.search}>
          <span className={styles.visuallyHidden}>Search assets</span>
          <MagnifyingGlass size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search filename, description, or tag"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.folderTabs} aria-label="Filter by folder">
          {["all", "content", "press", "documents"].map((folder) => (
            <button
              key={folder}
              type="button"
              aria-pressed={folderFilter === folder}
              onClick={() => setFolderFilter(folder)}
            >
              {folder === "all" ? "All folders" : folder}
            </button>
          ))}
        </div>
        <span className={styles.resultCount}>
          {filteredAssets.length} shown
        </span>
      </div>

      <div className={styles.contentLayout}>
        <section
          className={styles.assetCollection}
          aria-labelledby="assets-heading"
        >
          <div className={styles.sectionHead}>
            <div>
              <h3 id="assets-heading">Assets</h3>
              <p>Open an item when you need to inspect or edit its metadata.</p>
            </div>
          </div>
          {assets.length === 0 ? (
            <EmptyState
              className={styles.empty}
              tone="media"
              title="No assets yet"
              description="Request a secure upload. Ready assets will appear here with dimensions and approval state."
              announce={false}
              action={
                <button type="button" onClick={() => setUploadOpen(true)}>
                  Upload first asset
                </button>
              }
            />
          ) : filteredAssets.length === 0 ? (
            <div className={styles.noResults}>
              <MagnifyingGlass size={26} aria-hidden="true" />
              <h3>No matching assets</h3>
              <p>Clear the search or choose another folder.</p>
            </div>
          ) : (
            <ul className={styles.grid} aria-label="Media assets">
              {filteredAssets.map((asset) => (
                <li key={asset.id}>
                  {/* Outside the card button — a button cannot nest inside a
                      button, and the card itself opens the details dialog. */}
                  <button
                    type="button"
                    className={styles.cardDelete}
                    aria-label={`Delete ${asset.filename}`}
                    disabled={!onDelete}
                    onClick={() => setPendingDelete(asset)}
                  >
                    <Trash size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`View ${asset.filename}`}
                    onClick={() => {
                      setSelectedID(asset.id);
                      setDetailsOpen(true);
                    }}
                  >
                    <span className={styles.preview}>
                      {asset.mimeType.startsWith("image/") &&
                      asset.publicUrl ? (
                        <Image
                          src={asset.publicUrl}
                          alt=""
                          width={asset.width || 640}
                          height={asset.height || 480}
                          unoptimized
                        />
                      ) : (
                        <>
                          <FilePdf
                            size={38}
                            weight="duotone"
                            aria-hidden="true"
                          />
                          <span className={styles.visuallyHidden}>PDF</span>
                        </>
                      )}
                      <span
                        className={styles.status}
                        data-status={asset.status}
                      >
                        {asset.status}
                      </span>
                    </span>
                    <span className={styles.assetCopy}>
                      <strong>{asset.filename}</strong>
                      <span>
                        {asset.width && asset.height
                          ? `${asset.width} × ${asset.height}`
                          : asset.mimeType}
                        {" · "}
                        {formatBytes(asset.bytes)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {detailsOpen && selected ? (
          <AdminDialog
            title="Asset details"
            description="Review delivery information and edit metadata."
            onClose={() => setDetailsOpen(false)}
          >
            <aside className={styles.editor} aria-labelledby="editor-title">
              <div className={styles.sectionHead}>
                <div>
                  <h3 id="editor-title">Metadata</h3>
                  <p>Metadata and delivery settings.</p>
                </div>
              </div>
              <form onSubmit={save} key={selected.id}>
                <div className={styles.selectedFile}>
                  <span aria-hidden="true">
                    {selected.mimeType === "application/pdf" ? (
                      <FilePdf size={22} weight="duotone" />
                    ) : (
                      <ImageSquare size={22} weight="duotone" />
                    )}
                  </span>
                  <div>
                    <p className={styles.filename}>{selected.filename}</p>
                    <p>{formatBytes(selected.bytes)}</p>
                  </div>
                </div>
                <label>
                  Alternative text
                  <span>Describe content, not filename.</span>
                  <textarea
                    name="altText"
                    required
                    minLength={8}
                    defaultValue={selected.altText}
                  />
                </label>
                <label>
                  Tags
                  <input name="tags" defaultValue={selected.tags.join(", ")} />
                </label>
                <label>
                  Approved transformations
                  <input
                    name="transformations"
                    defaultValue={selected.transformations.join(", ")}
                    aria-describedby="transform-help"
                  />
                  <span id="transform-help">
                    Use configured names such as hero or card.
                  </span>
                </label>
                <dl className={styles.metadata}>
                  <div>
                    <dt>Folder</dt>
                    <dd>{selected.folder}</dd>
                  </div>
                  <div>
                    <dt>Usage</dt>
                    <dd>
                      {selected.referenceCount} reference
                      {selected.referenceCount === 1 ? "" : "s"}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{selected.status}</dd>
                  </div>
                </dl>
                <button
                  type="submit"
                  className={styles.primaryAction}
                  disabled={busy || !onSave}
                >
                  <FloppyDisk size={17} aria-hidden="true" />
                  Save metadata
                </button>
                {["draft", "uploading", "failed"].includes(selected.status) ? (
                  <div className={styles.retry}>
                    <label>
                      Original file
                      <input
                        type="file"
                        accept={selected.mimeType}
                        onChange={(event) =>
                          setRetryFile(event.currentTarget.files?.[0] ?? null)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || !onRetry}
                      onClick={retry}
                    >
                      <ArrowClockwise size={17} aria-hidden="true" />
                      Retry secure upload
                    </button>
                  </div>
                ) : null}
                <div className={styles.dangerZone}>
                  <div>
                    <strong>Delete asset</strong>
                    <p>Only unused assets can be removed.</p>
                  </div>
                  <button
                    className={styles.danger}
                    type="button"
                    aria-label="Delete asset"
                    disabled={busy || !onDelete}
                    onClick={() => setPendingDelete(selected)}
                  >
                    <Trash size={17} aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </form>
            </aside>
          </AdminDialog>
        ) : null}

        {pendingDelete ? (
          <AdminDialog
            title="Delete this asset?"
            description="The file is removed from the media provider as well as this library. This cannot be undone."
            onClose={() => setPendingDelete(null)}
          >
            <div className={styles.confirm}>
              <p className={styles.confirmName}>{pendingDelete.filename}</p>
              {pendingDelete.referenceCount > 0 ? (
                <p role="alert">
                  This asset is used in {pendingDelete.referenceCount} place
                  {pendingDelete.referenceCount === 1 ? "" : "s"}, so it cannot
                  be deleted. Remove it from those items first.
                </p>
              ) : (
                <p>Nothing currently references this asset.</p>
              )}
              <div className={styles.confirmActions}>
                <button type="button" onClick={() => setPendingDelete(null)}>
                  Keep it
                </button>
                <button
                  className={styles.danger}
                  type="button"
                  disabled={busy || pendingDelete.referenceCount > 0}
                  onClick={() => void remove(pendingDelete)}
                >
                  <Trash size={17} aria-hidden="true" />
                  Delete permanently
                </button>
              </div>
            </div>
          </AdminDialog>
        ) : null}
      </div>
    </section>
  );
}

function splitList(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function formatBytes(bytes: number) {
  if (!bytes) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
