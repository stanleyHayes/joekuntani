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
    await sendToProvider(body.upload, input.file, input.tags);
    return mapAsset(body.asset);
  } catch {
    return { ...mapAsset(body.asset), status: "failed" };
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
