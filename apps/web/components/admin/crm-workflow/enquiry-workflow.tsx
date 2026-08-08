"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { DateField } from "../../ui/date-field";
import { Select } from "../../ui/select";
import { DocumentUploadField } from "../media/asset-picker";

type Note = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
};
type Task = {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_at: string;
};
type History = {
  id: string;
  from: string;
  to: string;
  created_at: string;
};
type Attachment = { id: string; label: string };
type Delivery = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error_code?: string;
};
type Workflow = {
  notes: Note[];
  tasks: Task[];
  stage_history: History[];
  attachments: Attachment[];
};

async function request(path: string, init?: RequestInit) {
  const csrf = cookie("jk_admin_csrf");
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.method && init.method !== "GET"
        ? { "X-CSRF-Token": csrf }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error("request failed");
  return response.status === 204 ? null : response.json();
}
function cookie(name: string) {
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

export function EnquiryWorkflow({
  enquiryId,
  initial = { notes: [], tasks: [], stage_history: [], attachments: [] },
  deliveries: initialDeliveries = [],
  autoload = true,
}: {
  enquiryId: string;
  initial?: Workflow;
  deliveries?: Delivery[];
  autoload?: boolean;
}) {
  const [workflow, setWorkflow] = useState(initial);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [message, setMessage] = useState("");
  // Held in state rather than read off the form, because the document is
  // uploaded before the form is submitted — the id it produces has nowhere
  // else to live.
  const [attachment, setAttachment] = useState({
    assetID: "",
    label: "",
    filename: "",
  });
  const base = `/api/admin/crm/enquiries/${enquiryId}`;
  const refresh = useCallback(async () => {
    const [next, deliveryResult] = await Promise.all([
      request(`${base}/workflow`),
      request(`${base}/deliveries`),
    ]);
    setWorkflow(next);
    setDeliveries(deliveryResult.items);
  }, [base]);
  useEffect(() => {
    if (!autoload) return;
    const timer = window.setTimeout(
      () =>
        void refresh().catch(() => setMessage("Lead activity is unavailable.")),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [autoload, refresh]);
  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      await request(`${base}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: form.get("body") }),
      });
      await refresh();
      element.reset();
      setMessage("Internal note added.");
    } catch {
      setMessage("The note could not be added.");
    }
  }
  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    try {
      await request(`${base}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          assignee_id: form.get("assignee_id"),
          priority: form.get("priority"),
          due_at: new Date(String(form.get("due_at"))).toISOString(),
        }),
      });
      await refresh();
      element.reset();
      setMessage("Task added.");
    } catch {
      setMessage("The task could not be added.");
    }
  }
  async function addAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await request(`${base}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          asset_id: attachment.assetID,
          label: attachment.label,
        }),
      });
      await refresh();
      setAttachment({ assetID: "", label: "", filename: "" });
      setMessage("Protected proposal attachment added.");
    } catch {
      setMessage("The attachment must be a ready protected document.");
    }
  }
  async function retryDelivery(id: string) {
    try {
      await request(`${base}/deliveries/${id}/retry`, { method: "POST" });
      await refresh();
      setMessage("Notification queued for retry.");
    } catch {
      setMessage("The notification could not be retried.");
    }
  }
  async function completeTask(id: string) {
    try {
      await request(`${base}/tasks/${id}/complete`, { method: "POST" });
      await refresh();
      setMessage("Task completed.");
    } catch {
      setMessage("The task could not be completed.");
    }
  }
  async function openAttachment(id: string) {
    try {
      const result = await request(`${base}/attachments/${id}/access`, {
        method: "POST",
      });
      window.location.assign(result.url);
    } catch {
      setMessage("The private attachment could not be opened.");
    }
  }
  return (
    <section aria-labelledby="workflow-title">
      <h2 id="workflow-title">Lead activity</h2>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <form onSubmit={addNote}>
        <h3>Add internal note</h3>
        <label>
          Note
          <textarea name="body" required maxLength={4000} />
        </label>
        <button type="submit">Add note</button>
      </form>
      <form onSubmit={addTask}>
        <h3>Add follow-up task</h3>
        <label>
          Title
          <input name="title" required maxLength={200} />
        </label>
        <label>
          Assignee ID
          <input name="assignee_id" required />
        </label>
        <label>
          Priority
          <Select
            name="priority"
            defaultValue="normal"
            options={[
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
              { value: "urgent", label: "Urgent" },
            ]}
            aria-label="Task priority"
          />
        </label>
        <label>
          Due at
          <DateField
            name="due_at"
            aria-label="Due at"
            mode="datetime"
            required
          />
        </label>
        <button type="submit">Add task</button>
      </form>
      <form onSubmit={addAttachment}>
        <h3>Add proposal attachment</h3>
        <DocumentUploadField
          label="Proposal document"
          hint="Uploads to protected storage. Only the lead's own staff can open it, through a signed link."
          value={attachment.assetID}
          filename={attachment.filename}
          onChange={(assetID, filename) =>
            setAttachment((current) => ({
              assetID,
              // The filename is a sensible first label; an operator who has
              // already written one keeps it.
              label: current.label || filename.replace(/\.pdf$/i, ""),
              filename,
            }))
          }
        />
        <label>
          Label
          <input
            name="label"
            required
            maxLength={200}
            value={attachment.label}
            onChange={(event) =>
              setAttachment((current) => ({
                ...current,
                label: event.target.value,
              }))
            }
          />
        </label>
        <button type="submit" disabled={!attachment.assetID}>
          Add attachment
        </button>
      </form>
      <h3>Notes</h3>
      {workflow.notes.length ? (
        <ol>
          {workflow.notes.map((note) => (
            <li key={note.id}>
              <p>{note.body}</p>
              <small>{new Date(note.created_at).toLocaleString()}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p>No internal notes.</p>
      )}
      <h3>Tasks</h3>
      {workflow.tasks.length ? (
        <ul>
          {workflow.tasks.map((task) => (
            <li key={task.id}>
              <strong>{task.title}</strong> — {task.priority}, {task.status};
              due{" "}
              <time dateTime={task.due_at}>
                {new Date(task.due_at).toLocaleString()}
              </time>
              {task.status === "open" ? (
                <button type="button" onClick={() => completeTask(task.id)}>
                  Complete task
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>No follow-up tasks.</p>
      )}
      <h3>Stage history</h3>
      {workflow.stage_history.length ? (
        <ol>
          {workflow.stage_history.map((item) => (
            <li key={item.id}>
              {item.from} → {item.to}
            </li>
          ))}
        </ol>
      ) : (
        <p>No stage changes.</p>
      )}
      <h3>Proposal attachments</h3>
      {workflow.attachments.length ? (
        <ul>
          {workflow.attachments.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => openAttachment(item.id)}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No proposal attachments.</p>
      )}
      <h3>Notification delivery</h3>
      {deliveries.length ? (
        <table>
          <caption>Internal notification delivery and retry status</caption>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((item) => (
              <tr key={item.id}>
                <td>{item.kind}</td>
                <td>{item.status}</td>
                <td>{item.attempts}</td>
                <td>
                  {["failed", "dead_letter"].includes(item.status) ? (
                    <button
                      type="button"
                      onClick={() => retryDelivery(item.id)}
                    >
                      Retry
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No internal notifications.</p>
      )}
    </section>
  );
}
