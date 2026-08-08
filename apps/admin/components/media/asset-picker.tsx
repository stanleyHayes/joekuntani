"use client";

import {
  FilePdfIcon,
  ImageSquareIcon,
  SpinnerGapIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useState, type ChangeEvent } from "react";
import { listAssets, requestUpload } from "./media-admin";
import type { MediaAsset } from "./media-library";
import styles from "./asset-picker.module.css";

/**
 * Click-to-upload image fields for the admin console.
 *
 * These exist because every image across the dashboard used to be set by typing
 * a media-library UUID into a text box — an operator had to upload in one screen,
 * find the id, then paste it somewhere else. Nothing here exposes an id: picking
 * a file is the only interaction, and the stored id stays an implementation
 * detail behind a thumbnail.
 */

type UploadState = "" | "uploading" | "pending" | "failed";

/**
 * Resolves stored asset ids to something an operator can actually see.
 *
 * A field holding a saved id had nothing to render unless its parent happened
 * to pass a preview URL, so reopening a record showed an empty slot above a
 * button reading "Replace image" — offering to replace something the screen
 * never showed. The id is enough to look the asset up, so the field does that
 * itself instead of depending on every caller to remember.
 *
 * The lookup is shared: one media listing serves every field on the page, and
 * a freshly uploaded asset seeds it directly so no round trip is needed.
 */
// Only an in-flight request is shared, never a settled result. Several fields
// mounting together make one call between them; a field mounting later gets
// current data instead of whatever the first render happened to see.
let inFlight: Promise<Map<string, MediaAsset>> | null = null;

function resolveAssets() {
  inFlight ??= Promise.resolve(listAssets?.())
    .then((assets) => new Map((assets ?? []).map((asset) => [asset.id, asset])))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Looks up the assets behind ids the caller could not preview itself. */
function useStoredAssets(ids: string[]) {
  const [known, setKnown] = useState<Record<string, MediaAsset>>({});
  const key = ids.filter((id) => id && !known[id]).join(",");

  useEffect(() => {
    if (!key) return;
    let live = true;
    void resolveAssets().then((index) => {
      if (!live) return;
      const found: Record<string, MediaAsset> = {};
      for (const id of key.split(",")) {
        const asset = index.get(id);
        if (asset) found[id] = asset;
      }
      if (Object.keys(found).length)
        setKnown((current) => ({ ...current, ...found }));
    });
    return () => {
      live = false;
    };
  }, [key]);

  return (id: string) => (id ? known[id] : undefined);
}

/** A blob URL for the file just picked, so a preview appears before any upload
    finishes — and still appears when the CDN copy is not ready. */
function localPreview(file: File) {
  try {
    return URL.createObjectURL(file);
  } catch {
    return "";
  }
}

function releasePreview(url: string) {
  if (url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Nothing to release; the browser already reclaimed it.
    }
  }
}

function useUploader(folder: string, label: string) {
  const [state, setState] = useState<UploadState>("");

  async function upload(file: File) {
    setState("uploading");
    try {
      const asset = await requestUpload({
        file,
        folder,
        altText: label,
        tags: [folder],
      });
      // A draft asset means the media provider is not configured yet: the record
      // exists but nothing reached the CDN, so say so rather than showing a
      // thumbnail that will never load.
      setState(asset.status === "ready" ? "" : "pending");
      return asset;
    } catch {
      setState("failed");
      return null;
    }
  }

  return { state, setState, upload };
}

function StatusNote({ state }: { state: UploadState }) {
  if (state === "failed")
    return (
      <p className={styles.failed} role="alert">
        That upload did not complete. Try again.
      </p>
    );
  if (state === "pending")
    return (
      <p className={styles.note}>
        Saved, but the media provider is still finishing the transfer.
      </p>
    );
  return null;
}

/** A single image — brand logo, product hero, page portrait. */
export function AssetUploadField({
  label,
  hint,
  folder,
  value,
  previewURL,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  folder: string;
  /** The stored asset id. Never shown to the operator. */
  value: string;
  /** Existing image to show when the page already has one saved. */
  previewURL?: string;
  onChange: (assetID: string) => void;
  disabled?: boolean;
}) {
  const { state, setState, upload } = useUploader(folder, label);
  const [preview, setPreview] = useState("");
  const storedAsset = useStoredAssets([value]);
  // The picked file first, then whatever the caller passed, then the asset the
  // stored id points at. Something is always shown when something is stored.
  const shown = preview || previewURL || storedAsset(value)?.publicUrl || "";
  // "Replace" is only honest once the operator can see what they are replacing.
  const action = shown ? "Replace" : "Choose";

  useEffect(() => () => releasePreview(preview), [preview]);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    // Shown straight away from the local file. Waiting for the upload left the
    // slot blank through the whole transfer, and left it blank for good when
    // the provider was not configured to return a URL.
    const local = localPreview(file);
    if (local) setPreview(local);
    const asset = await upload(file);
    if (!asset) return;
    onChange(asset.id);
    if (asset.publicUrl) setPreview(asset.publicUrl);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.label}>{label}</span>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      <div className={styles.row}>
        <span
          className={`${styles.thumb} ${styles.thumbSolo}`}
          data-empty={shown ? "false" : "true"}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" />
          ) : (
            <ImageSquareIcon size={26} weight="duotone" aria-hidden="true" />
          )}
        </span>
        <div className={styles.actions}>
          <label className={styles.upload} data-busy={state === "uploading"}>
            {state === "uploading" ? (
              <SpinnerGapIcon size={14} className={styles.spinner} />
            ) : null}
            {state === "uploading" ? "Uploading…" : `${action} image`}
            <input
              type="file"
              accept="image/*"
              aria-label={`${action} ${label}`}
              disabled={disabled || state === "uploading"}
              onChange={pick}
            />
          </label>
          {value ? (
            <button
              type="button"
              className={styles.remove}
              onClick={() => {
                onChange("");
                setPreview("");
                setState("");
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <StatusNote state={state} />
    </div>
  );
}

/**
 * A single document — a proposal PDF attached to a CRM lead.
 *
 * Separate from AssetUploadField because a document has no thumbnail to show
 * and no dimensions to read: the filename is the only thing an operator can
 * recognise it by. It also has a stricter readiness rule. The CRM refuses any
 * attachment whose asset is not `ready`, so a document that uploaded into a
 * draft record would be silently rejected at attach time — this says so at
 * upload time instead.
 */
export function DocumentUploadField({
  label,
  hint,
  folder = "documents",
  value,
  filename,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  folder?: string;
  /** The stored asset id. Never shown to the operator. */
  value: string;
  /** Name of an already-attached document, shown when reopening a record. */
  filename?: string;
  onChange: (assetID: string, filename: string) => void;
  disabled?: boolean;
}) {
  const { state, setState, upload } = useUploader(folder, label);
  const [picked, setPicked] = useState("");
  const storedAsset = useStoredAssets([value]);
  // A document has no thumbnail, so its filename is the whole preview. Falling
  // back to the stored asset means reopening a record shows which PDF is
  // attached rather than an empty slot beside a "Replace" button.
  const shown = picked || filename || storedAsset(value)?.filename || "";
  const action = shown ? "Replace" : "Choose";

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    // The chosen name is shown immediately; the server may rename on store, in
    // which case the reply below corrects it.
    setPicked(file.name);
    const asset = await upload(file);
    if (!asset) return;
    setPicked(asset.filename || file.name);
    onChange(asset.id, asset.filename || file.name);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.label}>{label}</span>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      <div className={styles.row}>
        <span
          className={`${styles.thumb} ${styles.thumbSolo}`}
          data-empty={shown ? "false" : "true"}
        >
          <FilePdfIcon size={26} weight="duotone" aria-hidden="true" />
        </span>
        <div className={styles.actions}>
          <span className={styles.filename}>{shown || "No document yet"}</span>
          <label className={styles.upload} data-busy={state === "uploading"}>
            {state === "uploading" ? (
              <SpinnerGapIcon size={14} className={styles.spinner} />
            ) : null}
            {state === "uploading" ? "Uploading…" : `${action} PDF`}
            <input
              type="file"
              accept="application/pdf"
              aria-label={`${action} ${label}`}
              disabled={disabled || state === "uploading"}
              onChange={pick}
            />
          </label>
          {value ? (
            <button
              type="button"
              className={styles.remove}
              onClick={() => {
                onChange("", "");
                setPicked("");
                setState("");
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {state === "pending" ? (
        <p className={styles.failed} role="alert">
          The media provider has not finished this transfer, so the document
          cannot be attached yet. Try again once it is ready.
        </p>
      ) : (
        <StatusNote state={state} />
      )}
    </div>
  );
}

/** Several images — a product gallery or a page's supporting imagery. */
export function AssetUploadList({
  label,
  hint,
  folder,
  values,
  onChange,
  max = 8,
  disabled = false,
  previewFor,
  leadBadge,
}: {
  label: string;
  hint?: string;
  folder: string;
  values: string[];
  onChange: (assetIDs: string[]) => void;
  max?: number;
  disabled?: boolean;
  /** Resolves an already-saved id to its URL. Without it, reopening a record
      showed grey placeholders, so an operator could not see which picture they
      were about to replace. */
  previewFor?: (assetID: string) => string | undefined;
  /** Names what the public site does with the first image, e.g. "Hero". The
      order is load-bearing — pages read index 0 — so it has to be visible. */
  leadBadge?: string;
}) {
  const { state, setState, upload } = useUploader(folder, label);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const storedAsset = useStoredAssets(values);
  const full = values.length >= max;

  function promote(id: string) {
    onChange([id, ...values.filter((item) => item !== id)]);
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])].slice(0, max - values.length);
    event.target.value = "";
    if (!files.length) return;
    const added: string[] = [];
    const shots: Record<string, string> = {};
    for (const file of files) {
      const asset = await upload(file);
      if (!asset) return;
      added.push(asset.id);
      // Falls back to the local file so a tile always shows the picture that
      // was just added, even before the CDN copy exists.
      shots[asset.id] = asset.publicUrl || localPreview(file);
    }
    setPreviews((current) => ({ ...current, ...shots }));
    onChange([...values, ...added]);
    setState("");
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>
          {values.length}/{max}
        </span>
      </div>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      <ul className={styles.gallery}>
        {values.map((id, index) => {
          const source =
            previews[id] || previewFor?.(id) || storedAsset(id)?.publicUrl || "";
          const lead = index === 0 && Boolean(leadBadge);
          return (
            <li className={styles.tile} key={id} data-lead={lead}>
              <span className={styles.thumb} data-empty={source ? "false" : "true"}>
                {source ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={source} alt="" />
                ) : (
                  <ImageSquareIcon
                    size={22}
                    weight="duotone"
                    aria-hidden="true"
                  />
                )}
              </span>
              {lead ? <span className={styles.lead}>{leadBadge}</span> : null}
              <div className={styles.tileTools}>
                {index > 0 && leadBadge ? (
                  <button
                    type="button"
                    className={styles.tileAction}
                    onClick={() => promote(id)}
                  >
                    Make {leadBadge.toLowerCase()}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.removeThumb}
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() => onChange(values.filter((item) => item !== id))}
                >
                  <XIcon size={12} weight="bold" />
                </button>
              </div>
            </li>
          );
        })}
        {!full ? (
          <li className={styles.tile}>
            <label className={styles.addTile} data-busy={state === "uploading"}>
              {state === "uploading" ? (
                <SpinnerGapIcon size={20} className={styles.spinner} />
              ) : (
                <ImageSquareIcon size={20} weight="duotone" />
              )}
              <span>{state === "uploading" ? "Uploading…" : "Add image"}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                aria-label={`Add images to ${label}`}
                disabled={disabled || state === "uploading"}
                onChange={pick}
              />
            </label>
          </li>
        ) : null}
      </ul>
      <StatusNote state={state} />
    </div>
  );
}
