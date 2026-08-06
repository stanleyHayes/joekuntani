"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";

import { EmptyState } from "../../ui/empty-state";
import { Select } from "../../ui/select";
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
}: MediaLibraryProps) {
  const [assets, setAssets] = useState(initialAssets);
  const [selectedID, setSelectedID] = useState(initialAssets[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const selected = useMemo(
    () => assets.find((asset) => asset.id === selectedID),
    [assets, selectedID],
  );

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

  async function remove() {
    if (!selected || !onDelete) return;
    if (selected.referenceCount > 0) {
      setNotice(
        `This asset is used in ${selected.referenceCount} place${selected.referenceCount === 1 ? "" : "s"} and cannot be deleted.`,
      );
      return;
    }
    setBusy(true);
    try {
      await onDelete(selected.id);
      setAssets((current) =>
        current.filter((asset) => asset.id !== selected.id),
      );
      setSelectedID("");
      setNotice("Asset deleted.");
    } catch {
      setNotice("The asset could not be deleted. It remains available.");
    } finally {
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
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Content studio / Media</p>
          <h1 id="media-title">Asset library</h1>
          <p>
            Upload approved files, add useful descriptions, and see where every
            asset is used.
          </p>
        </div>
        <span className={styles.count}>{assets.length} assets</span>
      </header>
      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>
      <div className={styles.workspace}>
        <form
          className={styles.upload}
          onSubmit={upload}
          aria-labelledby="upload-title"
        >
          <h2 id="upload-title">Upload an asset</h2>
          <label>
            File<span>JPEG, PNG, WebP or PDF; 10 MB maximum</span>
            <input
              name="file"
              type="file"
              accept={allowedTypes.join(",")}
              required
            />
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
          <label>
            Alternative text
            <span>Describe the purpose and visible subject.</span>
            <textarea name="altText" required minLength={8} />
          </label>
          <label>
            Tags<span>Comma separated</span>
            <input name="tags" />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Working…" : "Request secure upload"}
          </button>
        </form>
        <div className={styles.gridPanel}>
          <h2>Assets</h2>
          {assets.length === 0 ? (
            <EmptyState
              className={styles.empty}
              tone="media"
              title="The media shelf is clear"
              description="Request a secure upload above. Ready assets will appear here with their dimensions and approval state."
            />
          ) : (
            <ul className={styles.grid} aria-label="Media assets">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    aria-pressed={selectedID === asset.id}
                    onClick={() => setSelectedID(asset.id)}
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
                        <span aria-hidden="true">
                          {asset.mimeType === "application/pdf"
                            ? "PDF"
                            : "FILE"}
                        </span>
                      )}
                    </span>
                    <strong>{asset.filename}</strong>
                    <span>
                      {asset.width && asset.height
                        ? `${asset.width} × ${asset.height}`
                        : asset.mimeType}
                    </span>
                    <span className={styles.status}>{asset.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className={styles.editor} aria-labelledby="editor-title">
          <h2 id="editor-title">Asset details</h2>
          {!selected ? (
            <p>Select an asset to edit its metadata.</p>
          ) : (
            <form onSubmit={save} key={selected.id}>
              <p className={styles.filename}>{selected.filename}</p>
              <label>
                Alternative text
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
              <dl>
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
              </dl>
              <button type="submit" disabled={busy || !onSave}>
                Save metadata
              </button>
              {["draft", "uploading", "failed"].includes(selected.status) && (
                <>
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
                    Retry secure upload
                  </button>
                </>
              )}
              <button
                className={styles.danger}
                type="button"
                disabled={busy || !onDelete}
                onClick={remove}
              >
                Delete asset
              </button>
            </form>
          )}
        </aside>
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
