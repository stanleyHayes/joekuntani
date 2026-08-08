"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ContentItem, ContentKind } from "../../content/types";
import { EmptyState } from "../../ui/empty-state";
import { Select } from "../../ui/select";
import { AdminErrorState, AdminSkeleton } from "../admin-feedback";
import {
  contentEditorHref,
  contentKinds,
  type StaffRole,
} from "./content-api";
import styles from "./content-manager.module.css";

/**
 * The content library: find an item, then open it.
 *
 * Editing lives on `/admin/content/[kind]/[id]`, so this component holds no
 * draft state — every row is a link, which is what lets an operator open two
 * drafts in two tabs and keep the browser's history honest.
 */
export function ContentManager({
  staffRole = "administrator",
}: {
  staffRole?: StaffRole;
}) {
  const [kind, setKind] = useState<ContentKind>("page");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const categories = useMemo(
    () =>
      [
        ...new Set(
          items
            .map((item) => item.category)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [items],
  );
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter(
      (item) =>
        (statusFilter === "all" || item.status === statusFilter) &&
        (categoryFilter === "all" || item.category === categoryFilter) &&
        (!needle ||
          `${item.title} ${item.slug ?? ""} ${item.tags.join(" ")}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
  }, [categoryFilter, items, query, statusFilter]);

  useEffect(() => {
    let current = true;
    void fetch(`/api/admin/content/${kind}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { items?: ContentItem[] };
      })
      .then((body) => {
        if (current) setItems(body.items ?? []);
      })
      .catch(() => {
        if (current) setError("Content could not be loaded. Try again.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [kind]);

  function switchKind(next: ContentKind) {
    setLoading(true);
    setError("");
    setKind(next);
  }

  return (
    <div className={styles.manager}>
      <section className={styles.stack} aria-labelledby="content-list-title">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Content and media</p>
            <h2 id="content-list-title">Content library</h2>
            <p className={styles.help}>
              Drafts never appear publicly. Approval and publication are
              separate controls.
            </p>
          </div>
          <div className={styles.headerActions}>
            <nav
              className={styles.quickLinks}
              aria-label="Content workspace sections"
            >
              <Link href="/admin/services">Services</Link>
              <Link href="/admin/media">Full media library</Link>
            </nav>
            <Link
              className={styles.newDraft}
              href={contentEditorHref(kind, "")}
            >
              New draft
            </Link>
          </div>
        </header>
        <p className={styles.permission} role="status">
          {staffRole === "administrator"
            ? "Administrator: editing, approval, scheduling and publication are available. Every accepted mutation is audited."
            : staffRole === "content_editor"
              ? "Content editor: create and edit drafts. Administrator approval and publication are required. Every accepted mutation is audited."
              : "Your permissions are being verified. The server authorizes every action."}
        </p>
        <div className={styles.controls}>
          <div className={styles.controlsHead}>
            <p className={styles.controlsTitle}>Refine</p>
            <p className={styles.controlsMeta}>
              {visibleItems.length}{" "}
              {visibleItems.length === 1 ? "item" : "items"}
              {items.length !== visibleItems.length
                ? ` of ${items.length}`
                : ""}
            </p>
          </div>
          <div className={styles.fieldGrid} aria-label="Content filters">
            <label className={styles.field}>
              Search title, slug or tag
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="text"
              />
            </label>
            <label className={styles.field}>
              Content type
              <Select
                aria-label="Content type"
                value={kind}
                onChange={(value) => switchKind(value as ContentKind)}
                options={contentKinds.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
              />
            </label>
            <label className={styles.field}>
              Status
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "draft", label: "Draft" },
                  { value: "scheduled", label: "Scheduled" },
                  { value: "published", label: "Published" },
                  { value: "unpublished", label: "Unpublished" },
                ]}
                aria-label="Status filter"
              />
            </label>
            <label className={styles.field}>
              Filter by category
              <Select
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: "all", label: "All categories" },
                  ...categories.map((category) => ({
                    value: category,
                    label: category,
                  })),
                ]}
                aria-label="Category filter"
              />
            </label>
          </div>
        </div>
        {loading ? (
          <AdminSkeleton label="Loading content" variant="table" />
        ) : visibleItems.length ? (
          <ul className={styles.list}>
            {visibleItems.map((item) => (
              <li className={styles.row} key={item.id}>
                <div className={styles.rowBody}>
                  <strong className={styles.rowTitle}>{item.title}</strong>
                  <span className={styles.rowMeta}>
                    <span
                      className={styles.badge}
                      data-state={
                        item.status === "published" ? "live" : undefined
                      }
                    >
                      {item.status}
                    </span>
                    <span
                      className={styles.badge}
                      data-state={item.approved ? undefined : "pending"}
                    >
                      {item.approved ? "approved" : "approval required"}
                    </span>
                    {item.slug ? (
                      <span className={styles.rowSlug}>/{item.slug}</span>
                    ) : null}
                  </span>
                </div>
                <Link
                  className={styles.editLink}
                  href={contentEditorHref(item.kind, item.id)}
                >
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            tone={items.length ? "search" : "stage"}
            title={
              items.length
                ? "Nothing matches these filters"
                : `No ${kind} pieces yet`
            }
            description={
              items.length
                ? "Widen the filters or clear the search to see drafts and published items again."
                : `No ${kind} content exists yet.`
            }
          />
        )}
      </section>
      {error ? (
        <AdminErrorState title="Content is unavailable" message={error} />
      ) : null}
    </div>
  );
}
