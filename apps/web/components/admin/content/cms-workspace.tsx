"use client";

import { useEffect, useState } from "react";

import { ServiceManager } from "../services/service-manager";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import { ContentManager } from "./content-manager";
import type { StaffRole } from "./content-api";
import styles from "./cms-workspace.module.css";

export function CMSWorkspace() {
  const [role, setRole] = useState<StaffRole | null>(null);
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
        if (current) setRole(staff.role);
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
        <ContentManager staffRole={role} />
      ) : (
        <ServiceManager />
      )}
    </div>
  );
}
