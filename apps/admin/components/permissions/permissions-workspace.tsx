"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS } from "../../lib/admin-nav";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import styles from "./permissions-workspace.module.css";

type RoleRow = {
  role: string;
  label: string;
  permissions: string[];
};

export function PermissionsWorkspace() {
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/admin/auth/permissions", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as {
          roles: RoleRow[];
          permissions: string[];
        };
        setRoles(body.roles ?? []);
        setPermissions(body.permissions ?? []);
      })
      .catch(() => setError("Permission matrix could not be loaded."));
  }, []);

  if (error)
    return (
      <AdminErrorState message={error} title="Permissions are unavailable" />
    );
  if (!roles)
    return <AdminSkeleton label="Loading permissions" variant="table" />;

  return (
    <section className={styles.workspace} aria-labelledby="permissions-heading">
      <header>
        <p>Team</p>
        <h2 id="permissions-heading">Permissions</h2>
        <p>
          Server-enforced RBAC for the four staff roles. Custom per-user grants
          are not supported — change the role instead.
        </p>
      </header>
      <div className={styles.panel}>
        <table>
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((role) => (
                <th key={role.role}>
                  {role.label || ROLE_LABELS[role.role] || role.role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission}>
                <td>
                  <code>{permission}</code>
                </td>
                {roles.map((role) => (
                  <td key={`${role.role}-${permission}`}>
                    {role.permissions.includes(permission) ? "Yes" : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
