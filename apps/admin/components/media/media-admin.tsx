"use client";
import { useEffect, useState } from "react";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { MediaAsset, MediaLibrary } from "./media-library";
type SafeAsset = {
  id: string;
  filename: string;
  mime_type: string;
  public_url: string;
  folder: string;
  alt_text: string;
  tags: string[];
  transformations: string[];
  status: MediaAsset["status"];
  width: number;
  height: number;
  bytes: number;
  reference_count: number;
};
type SignedUpload = {
  upload_url: string;
  api_key: string;
  folder: string;
  public_id: string;
  signature: string;
  timestamp: number;
};
type UploadResponse = {
  asset: SafeAsset;
  upload?: SignedUpload;
  retryable?: boolean;
};
export function MediaAdmin() {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/admin/media", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { assets: SafeAsset[] };
        setAssets(body.assets.map(mapAsset));
      })
      .catch(() => setError("Media assets could not be loaded. Try again."));
  }, []);
  if (error)
    return (
      <AdminErrorState title="Media assets are unavailable" message={error} />
    );
  if (!assets)
    return <AdminSkeleton label="Loading media assets" variant="cards" />;
  return (
    <MediaLibrary
      key={assets.map((asset) => asset.id + asset.status).join(":")}
      initialAssets={assets}
      onUpload={requestUpload}
      onRetry={retryUpload}
      onSave={saveMetadata}
      onDelete={deleteAsset}
      onRefresh={listAssets}
    />
  );
}
export async function requestUpload(input: {
  file: File;
  folder: string;
  altText: string;
  tags: string[];
}): Promise<MediaAsset> {
  const dimensions = await dimensionsFor(input.file);
  const response = await api("/api/admin/media/uploads", {
    method: "POST",
    body: JSON.stringify({
      filename: input.file.name,
      mime_type: input.file.type,
      folder: input.folder,
      alt_text: input.altText,
      tags: input.tags,
      transformations: [],
      bytes: input.file.size,
      width: dimensions.width,
      height: dimensions.height,
    }),
  });
  const body = (await response.json()) as UploadResponse;
  if (response.status === 503 && body.asset)
    return { ...mapAsset(body.asset), status: "draft" };
  if (!response.ok || !body.upload) throw new Error();
  try {
    const reply = await sendToProvider(body.upload, input.file, input.tags);
    // Confirm from the provider's own signed reply rather than waiting for its
    // callback, which cannot reach an API that has no public hostname. A failure
    // here is not fatal: the callback may still arrive, and the re-read below
    // reports whichever path won.
    await confirmUpload(body.asset.id, reply);
    // `body.asset` is the record as it stood *before* the file reached the
    // provider — status "uploading", no public URL. Returning it left every
    // freshly uploaded asset stuck on an UPLOADING badge with a placeholder
    // icon, even once the provider callback had marked it ready. Re-read it
    // instead, and keep the pre-upload record only if the re-read fails.
    return (await refreshAsset(body.asset.id)) ?? mapAsset(body.asset);
  } catch {
    return { ...mapAsset(body.asset), status: "failed" };
  }
}

/**
 * Re-reads one asset's server-side state.
 *
 * The provider confirms an upload out of band, by calling back into the API —
 * the browser cannot report completion itself, because the callback is signed
 * with a secret it must never hold. So the client's only honest move is to ask
 * the API what it now believes.
 */
export async function refreshAsset(id: string): Promise<MediaAsset | null> {
  const assets = await listAssets();
  return assets?.find((asset) => asset.id === id) ?? null;
}

export async function listAssets(): Promise<MediaAsset[] | null> {
  try {
    const response = await fetch("/api/admin/media", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { assets: SafeAsset[] };
    return body.assets.map(mapAsset);
  } catch {
    return null;
  }
}
export async function retryUpload(id: string, file: File): Promise<MediaAsset> {
  const response = await api(
    `/api/admin/media/${encodeURIComponent(id)}/upload`,
    { method: "POST" },
  );
  const body = (await response.json()) as UploadResponse;
  if (!response.ok || !body.upload) throw new Error();
  await sendToProvider(body.upload, file, body.asset.tags ?? []);
  return mapAsset(body.asset);
}
export async function saveMetadata(
  id: string,
  input: Pick<MediaAsset, "altText" | "tags" | "transformations">,
): Promise<MediaAsset> {
  const response = await api(`/api/admin/media/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      alt_text: input.altText,
      tags: input.tags,
      transformations: input.transformations,
    }),
  });
  if (!response.ok) throw new Error();
  return mapAsset((await response.json()) as SafeAsset);
}
export async function deleteAsset(id: string) {
  const response = await api(`/api/admin/media/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error();
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
async function sendToProvider(
  signed: SignedUpload,
  file: File,
  tags: string[],
) {
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", signed.api_key);
  form.set("timestamp", String(signed.timestamp));
  form.set("signature", signed.signature);
  form.set("folder", signed.folder);
  form.set("public_id", signed.public_id);
  if (tags.length) form.set("tags", tags.join(","));
  const response = await fetch(signed.upload_url, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error();
  // The provider's reply is the only proof the upload landed that we are
  // guaranteed to receive. Its callback cannot reach an API with no public
  // hostname, so relying on it alone left every upload stuck at "uploading" in
  // development and stranded any dropped callback in production. Hand the reply
  // back so the API can verify its signature and mark the asset ready.
  return (await response.json()) as unknown;
}
/**
 * Hands the provider's signed upload reply to the API so the asset becomes ready.
 *
 * Swallows its own failure on purpose. The provider callback remains the other
 * route to the same state, and a confirm that loses a race with it comes back as
 * a conflict — not something worth failing an upload the user can see succeeded.
 */
async function confirmUpload(assetID: string, reply: unknown) {
  try {
    await api(`/api/admin/media/${encodeURIComponent(assetID)}/confirm`, {
      method: "POST",
      body: JSON.stringify(reply),
    });
  } catch {
    // Deliberately ignored — see above.
  }
}
export async function dimensionsFor(file: File) {
  if (!file.type.startsWith("image/")) return { width: 0, height: 0 };
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
export function mapAsset(asset: SafeAsset): MediaAsset {
  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mime_type,
    publicUrl: asset.public_url,
    folder: asset.folder,
    altText: asset.alt_text,
    tags: asset.tags ?? [],
    transformations: asset.transformations ?? [],
    status: asset.status,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    referenceCount: asset.reference_count,
  };
}
function csrfCookie() {
  const prefix = "jk_admin_csrf=";
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}
