"use client";

import { useEffect, useState } from "react";

import { ServiceManager } from "../services/service-manager";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { ContentManager } from "./content-manager";
import type { CacheInvalidationRequest } from "./content-manager";
import styles from "./cms-workspace.module.css";

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

export function CMSWorkspace() {
  const [role, setRole] = useState<StaffRole | null>(null);
  const [media, setMedia] = useState<MediaOption[]>([]);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"content" | "services">("content");

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
          if (current) setRole(staff.role);
          return;
        }
        const mediaResponse = await fetch("/api/admin/media", {
          cache: "no-store",
          credentials: "include",
        });
        const mediaBody = mediaResponse.ok
          ? ((await mediaResponse.json()) as { assets?: MediaOption[] })
          : { assets: [] };
        if (current) {
          setRole(staff.role);
          setMedia(mediaBody.assets ?? []);
        }
      })
      .catch(() => {
        if (current)
          setError(
            "Your content permissions could not be verified. Reload this workspace before editing.",
          );
      });
    return () => {
      current = false;
    };
  }, []);

  if (error)
    return (
      <AdminErrorState
        message={error}
        title="Content access could not be verified"
      />
    );
  if (!role)
    return (
      <AdminSkeleton label="Verifying content permissions" variant="page" />
    );
  if (role !== "administrator" && role !== "content_editor")
    return (
      <AdminErrorState
        title="Content workspace unavailable"
        message="Your role does not include content-management permission. No content, service, or media records were loaded."
        retry={false}
      />
    );
  return (
    <div className={styles.workspace}>
      <nav className={styles.tabs} aria-label="Unified content workspace">
        <button
          className={styles.tab}
          aria-pressed={section === "content"}
          onClick={() => setSection("content")}
          type="button"
        >
          Content and media
        </button>
        <button
          className={styles.tab}
          aria-pressed={section === "services"}
          onClick={() => setSection("services")}
          type="button"
        >
          Services
        </button>
      </nav>
      {section === "content" ? (
        <ContentManager
          staffRole={role}
          mediaOptions={media}
          requestCacheInvalidation={refreshPublishedContent}
        />
      ) : (
        <ServiceManager />
      )}
    </div>
  );
}

export async function refreshPublishedContent(
  request: CacheInvalidationRequest,
) {
  const response = await fetch("/api/admin/cms/cache-invalidation", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfCookie(),
    },
    body: JSON.stringify({
      content_id: request.contentID,
      revision: request.revision,
      kind: request.kind,
      slug: request.slug,
      action: request.reason,
      paths: request.paths,
      tags: request.tags,
    }),
  });
  if (!response.ok) throw new Error("Public content refresh failed");
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
