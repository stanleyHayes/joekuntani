"use client";

import { FormEvent, useEffect, useState } from "react";
import { ROLE_LABELS } from "../../lib/admin-nav";
import { AdminDialog } from "../admin-dialog";
import { EmptyState } from "@joe-kuntani/shared/ui/empty-state";
import { Select } from "@joe-kuntani/shared/ui/select";
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

const ROLE_OPTIONS = ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

export function TeamWorkspace() {
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
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
    setInviteLink(null);
    const form = new FormData(event.currentTarget);
    const formElement = event.currentTarget;
    const response = await fetch("/api/admin/auth/users", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfCookie(),
      },
      body: JSON.stringify({
        email: form.get("email"),
        role: form.get("role"),
      }),
    });
    if (!response.ok) {
      setError(
        "Could not send that invitation. Check that the email address is valid and not already in use.",
      );
      return;
    }
    const body = (await response.json()) as {
      email?: string;
      accept_url?: string;
      emailed?: boolean;
    };
    setStatus(
      body.emailed
        ? `Invitation sent to ${body.email}. It expires in 15 minutes — tell them to open it now, or send a fresh one.`
        : `Invitation created for ${body.email}. Email delivery is not configured, so send them the link below yourself.`,
    );
    // Surfaced whenever delivery did not happen — otherwise the account exists
    // with no way for anyone to reach it.
    setInviteLink(body.emailed ? null : (body.accept_url ?? null));
    formElement.reset();
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
          description="An address and a role is all this needs. They set their own password from the link, then can correct the display name derived from their email in Profile. The link works once and expires in 15 minutes."
          onClose={() => setInviteOpen(false)}
        >
          <form className={styles.panel} onSubmit={provision}>
            <div className={styles.grid}>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Role
                <Select
                  name="role"
                  defaultValue="content_editor"
                  options={ROLE_OPTIONS}
                  required
                />
              </label>
            </div>
            <button type="submit">Send invitation</button>
          </form>
        </AdminDialog>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}
      {status ? <p role="status">{status}</p> : null}
      {inviteLink ? (
        <div className={styles.inviteLink}>
          <p>
            Send this link to the invitee now. It works once and expires 15
            minutes after it was issued.
          </p>
          <div>
            <input readOnly value={inviteLink} aria-label="Invitation link" />
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(inviteLink)}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

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
                    <Select
                      value={user.role}
                      aria-label={`Role for ${user.name}`}
                      onChange={(role) => void changeRole(user.id, role)}
                      disabled={user.status !== "active"}
                      options={ROLE_OPTIONS}
                      required
                    />
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
