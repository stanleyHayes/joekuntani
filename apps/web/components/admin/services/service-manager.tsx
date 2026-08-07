"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { PublicService, ServiceQuestion } from "../../services/types";
import { AiAssist, type AiAssistField } from "../../ui/ai-assist";
import { EmptyState } from "../../ui/empty-state";
import { AdminDialog } from "../admin-dialog";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import styles from "./service-manager.module.css";

type Draft = Omit<
  PublicService,
  | "id"
  | "slug"
  | "state"
  | "version"
  | "retired_at"
  | "created_at"
  | "updated_at"
>;

const emptyDraft: Draft = {
  name: "",
  summary: "",
  description: "",
  category: "",
  active: false,
  sort_order: 0,
  form_schema: { version: 1, questions: [] },
  cta: { label: "Start an enquiry", href: "/book" },
};

export function ServiceManager() {
  const [items, setItems] = useState<PublicService[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [questionsJSON, setQuestionsJSON] = useState("[]");
  const [questionsValid, setQuestionsValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/services", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { items: PublicService[] };
        setItems(body.items ?? []);
      } catch {
        setError("Services could not be loaded. Try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedID),
    [items, selectedID],
  );

  function edit(item: PublicService) {
    setSelectedID(item.id);
    setDraft({
      name: item.name,
      summary: item.summary,
      description: item.description,
      category: item.category,
      active: item.active,
      sort_order: item.sort_order,
      form_schema: item.form_schema,
      cta: item.cta,
    });
    setQuestionsJSON(JSON.stringify(item.form_schema.questions, null, 2));
    setQuestionsValid(true);
    setMessage("");
    setError("");
    setEditorOpen(true);
  }

  function reset() {
    setSelectedID(null);
    setDraft({ ...emptyDraft, sort_order: items.length });
    setQuestionsJSON("[]");
    setQuestionsValid(true);
    setMessage("");
    setError("");
    setEditorOpen(false);
  }

  function createService() {
    reset();
    setEditorOpen(true);
  }

  function updateQuestions(value: string) {
    setQuestionsJSON(value);
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) throw new Error();
      setDraft((current) => ({
        ...current,
        form_schema: {
          version: 1,
          questions: parsed as ServiceQuestion[],
        },
      }));
      setQuestionsValid(true);
    } catch {
      setQuestionsValid(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!questionsValid) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        selectedID
          ? `/api/admin/services/${selectedID}`
          : "/api/admin/services",
        {
          method: selectedID ? "PUT" : "POST",
          credentials: "include",
          headers: mutationHeaders(),
          body: JSON.stringify(
            selected ? { ...draft, version: selected.version } : draft,
          ),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 409
            ? "That service name conflicts with an existing immutable slug."
            : "The service was not accepted. Review every field and question.",
        );
        return;
      }
      const saved = (await response.json()) as PublicService;
      setItems((current) => {
        const next = current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved];
        return next.sort(serviceOrder);
      });
      edit(saved);
      setMessage("Service saved and audited.");
    } catch {
      setError("The service could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function setActive(item: PublicService) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/services/${item.id}/active`, {
        method: "PATCH",
        credentials: "include",
        headers: mutationHeaders(),
        body: JSON.stringify({ active: !item.active, version: item.version }),
      });
      if (!response.ok) throw new Error();
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                active: !candidate.active,
                state: candidate.active ? "inactive" : "active",
                version: candidate.version + 1,
              }
            : candidate,
        ),
      );
      if (selectedID === item.id) {
        setDraft((current) => ({ ...current, active: !item.active }));
      }
      setMessage(item.active ? "Service unpublished." : "Service published.");
    } catch {
      setError("The service state could not be changed.");
    } finally {
      setPending(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return;
    const ordered = [...items];
    [ordered[index], ordered[destination]] = [
      ordered[destination]!,
      ordered[index]!,
    ];
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/services/order", {
        method: "PUT",
        credentials: "include",
        headers: mutationHeaders(),
        body: JSON.stringify({
          items: ordered
            .filter((item) => item.state !== "retired")
            .map((item) => ({ id: item.id, version: item.version })),
        }),
      });
      if (!response.ok) throw new Error();
      setItems(
        ordered.map((item, order) =>
          item.state === "retired"
            ? item
            : { ...item, sort_order: order, version: item.version + 1 },
        ),
      );
      setMessage("Display order saved and audited.");
    } catch {
      setError("Display order could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function retire(item: PublicService) {
    const confirmed = window.confirm(
      `Retire ${item.name}? It will leave public pages but remain in service history.`,
    );
    if (!confirmed) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/services/${item.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { ...mutationHeaders(), "If-Match": String(item.version) },
      });
      if (!response.ok) throw new Error();
      const retired = (await response.json()) as PublicService;
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === retired.id ? retired : candidate,
        ),
      );
      if (selectedID === item.id) reset();
      setMessage("Service retired and retained in history.");
    } catch {
      setError("The service could not be retired. Refresh and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.manager}>
      <section className={styles.panel} aria-labelledby="service-list-title">
        <header className="stage-head">
          <div className="stage-head__copy">
            <p className="stage-head__eyebrow">Public offering</p>
            <h2 id="service-list-title">Services</h2>
            <p className="stage-head__lede">
              Only active services appear publicly. Order changes apply to the
              public services page.
            </p>
          </div>
          <div className="stage-head__actions">
            <button
              className="primary"
              disabled={pending}
              onClick={createService}
              type="button"
            >
              Add service
            </button>
          </div>
        </header>
        {loading ? (
          <AdminSkeleton label="Loading services" variant="table" />
        ) : items.length === 0 ? (
          <EmptyState
            announce={false}
            tone="stage"
            title="No services yet"
            description="Create the first approved service, then publish it when the details are complete."
          />
        ) : (
          <ol className={styles.list}>
            {items.map((item, index) => (
              <li className={styles.item} key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.state === "retired"
                      ? "Retired"
                      : item.active
                        ? "Published"
                        : "Inactive"}
                  </span>
                  <span>/{item.slug}</span>
                </div>
                <div className={styles.itemActions}>
                  <button
                    aria-label={`Move ${item.name} up`}
                    disabled={
                      pending || item.state === "retired" || index === 0
                    }
                    onClick={() => void move(index, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${item.name} down`}
                    disabled={
                      pending ||
                      item.state === "retired" ||
                      index === items.length - 1
                    }
                    onClick={() => void move(index, 1)}
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    disabled={item.state === "retired"}
                    onClick={() => edit(item)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    disabled={pending || item.state === "retired"}
                    onClick={() => void setActive(item)}
                    type="button"
                  >
                    {item.active ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    disabled={pending || item.state === "retired"}
                    onClick={() => void retire(item)}
                    type="button"
                  >
                    Retire
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {error === "Services could not be loaded. Try again." ? (
        <AdminErrorState title="Services are unavailable" message={error} />
      ) : error || message ? (
        <p
          className={error ? styles.error : styles.status}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
      ) : null}

      {editorOpen ? (
        <AdminDialog
          title={selected ? `Edit ${selected.name}` : "Add a service"}
          description="Service changes are saved only when you submit this form."
          onClose={reset}
          wide
        >
          <section className={styles.panel} aria-label="Service editor">
            <form className={styles.form} onSubmit={save}>
              <Field
                label="Service name"
                maxLength={120}
                required
                value={draft.name}
                onChange={(name) =>
                  setDraft((current) => ({ ...current, name }))
                }
              />
              <Field
                label="Category"
                maxLength={80}
                value={draft.category}
                onChange={(category) =>
                  setDraft((current) => ({ ...current, category }))
                }
              />
              <Field
                assist="summary"
                label="Summary"
                maxLength={280}
                multiline
                value={draft.summary}
                onChange={(summary) =>
                  setDraft((current) => ({ ...current, summary }))
                }
              />
              <Field
                assist="description"
                label="Description"
                maxLength={8000}
                multiline
                value={draft.description}
                onChange={(description) =>
                  setDraft((current) => ({ ...current, description }))
                }
              />
              <Field
                label="Call-to-action label"
                maxLength={80}
                required
                value={draft.cta.label}
                onChange={(label) =>
                  setDraft((current) => ({
                    ...current,
                    cta: { ...current.cta, label },
                  }))
                }
              />
              <label className={styles.field}>
                <span>Service-specific questions (JSON)</span>
                <textarea
                  aria-invalid={!questionsValid}
                  aria-describedby="questions-help"
                  onChange={(event) => updateQuestions(event.target.value)}
                  spellCheck={false}
                  value={questionsJSON}
                />
                <small id="questions-help">
                  Use unique keys and supported types: text, textarea, select,
                  multi_select, date, number or checkbox.
                </small>
              </label>
              <label className={styles.checkbox}>
                <input
                  checked={draft.active}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Publish immediately after save
              </label>
              <div className={styles.actions}>
                <button disabled={pending || !questionsValid} type="submit">
                  {selected ? "Save service" : "Create service"}
                </button>
                {selected && (
                  <button disabled={pending} onClick={reset} type="button">
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          </section>
        </AdminDialog>
      ) : null}
    </div>
  );
}

function Field({
  assist,
  label,
  maxLength,
  multiline = false,
  onChange,
  required = false,
  value,
}: {
  /** Attaches the AI copy bar. Multiline fields only — prose, not identifiers. */
  assist?: AiAssistField;
  label: string;
  maxLength: number;
  multiline?: boolean;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  const control = {
    maxLength,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
    required,
    value,
  };
  const field = (
    <label className={styles.field}>
      <span>{label}</span>
      {multiline ? <textarea {...control} /> : <input {...control} />}
    </label>
  );
  // Outside the <label>: a label's accessible name comes from its text
  // content, so an AI bar nested inside would rename the control to
  // "Summary AI Rewrite Expand Shorten…".
  if (!assist || !multiline) return field;
  return (
    <div className={styles.fieldGroup}>
      {field}
      <AiAssist field={assist} label={label} value={value} onApply={onChange} />
    </div>
  );
}

function mutationHeaders() {
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfCookie(),
  };
}

function csrfCookie() {
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("jk_admin_csrf="))
      ?.slice("jk_admin_csrf=".length) ?? ""
  );
}

function serviceOrder(left: PublicService, right: PublicService) {
  return (
    left.sort_order - right.sort_order || left.name.localeCompare(right.name)
  );
}
