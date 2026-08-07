"use client";

import { FormEvent, useEffect, useState } from "react";
import { ROLE_LABELS } from "../../../lib/admin-nav";
import { AdminDialog } from "../admin-dialog";
import { EmptyState } from "../../ui/empty-state";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import styles from "./team-workspace.module.css";

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  mfa_enabled: boolean;
};

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

const ROLES = [
  "administrator",
  "booking_manager",
  "content_editor",
  "analyst",
] as const;

export function TeamWorkspace() {
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/auth/users", {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 403) {
      setForbidden(true);
      setUsers([]);
      return;
    }
    if (!response.ok) throw new Error();
    const body = (await response.json()) as { users: StaffUser[] };
    setUsers(body.users ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() => setError("Staff directory could not be loaded."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function provision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/auth/users", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfCookie(),
      },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
      }),
    });
    if (!response.ok) {
      setError(
        "Could not provision staff. Check email uniqueness and password length.",
      );
      return;
    }
    setStatus(
      "Staff user created. Share credentials out of band; administrators need MFA enrollment on first login.",
    );
    event.currentTarget.reset();
    setInviteOpen(false);
    await load();
  }

  async function disableUser(id: string) {
    setError("");
    const response = await fetch(
      `/api/admin/auth/users/${encodeURIComponent(id)}/disable`,
      {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfCookie() },
      },
    );
    if (!response.ok) {
      setError("Could not disable user.");
      return;
    }
    await load();
  }

  async function changeRole(id: string, role: string) {
    setError("");
    const response = await fetch(
      `/api/admin/auth/users/${encodeURIComponent(id)}/role`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfCookie(),
        },
        body: JSON.stringify({ role }),
      },
    );
    if (!response.ok) {
      setError("Could not update role.");
      return;
    }
    await load();
  }

  if (forbidden) {
    return (
      <section className={styles.workspace}>
        <header>
          <p>Team</p>
          <h2>Users & roles</h2>
        </header>
        <AdminErrorState
          title="Administrator access required"
          message="Only administrators can manage staff users."
          retry={false}
        />
      </section>
    );
  }

  if (error && !users)
    return (
      <AdminErrorState message={error} title="Staff directory is unavailable" />
    );
  if (!users)
    return <AdminSkeleton label="Loading staff directory" variant="table" />;

  return (
    <section className={styles.workspace} aria-labelledby="team-heading">
      <header className="stage-head">
        <div className="stage-head__copy">
          <p className="stage-head__eyebrow">Team</p>
          <h2 id="team-heading">Users &amp; roles</h2>
          <p className="stage-head__lede">
            Provision staff, change roles, and disable accounts. Sessions revoke
            when roles change.
          </p>
        </div>
        <div className="stage-head__actions">
          <button
            className="primary"
            type="button"
            onClick={() => setInviteOpen(true)}
          >
            Invite staff
          </button>
        </div>
      </header>

      {inviteOpen ? (
        <AdminDialog
          title="Invite staff"
          description="Create a staff account and assign its initial role."
          onClose={() => setInviteOpen(false)}
        >
          <form className={styles.panel} onSubmit={provision}>
            <div className={styles.grid}>
              <label>
                Name
                <input name="name" required maxLength={120} />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Temporary password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                />
              </label>
              <label>
                Role
                <select name="role" defaultValue="content_editor">
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit">Create staff user</button>
          </form>
        </AdminDialog>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}
      {status ? <p role="status">{status}</p> : null}

      <div className={styles.panel}>
        <h3>Directory</h3>
        {users.length === 0 ? (
          <EmptyState
            announce={false}
            tone="inbox"
            title="No staff accounts yet"
            description="Invite the first staff member, then assign the role that matches what they need to reach."
            action={
              <button type="button" onClick={() => setInviteOpen(true)}>
                Invite staff
              </button>
            }
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      value={user.role}
                      aria-label={`Role for ${user.name}`}
                      onChange={(event) =>
                        void changeRole(user.id, event.target.value)
                      }
                      disabled={user.status !== "active"}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{user.status}</td>
                  <td>
                    {user.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => void disableUser(user.id)}
                      >
                        Disable
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
