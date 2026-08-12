"use client";

import { useState } from "react";
import type {
  ContentSection,
  SectionType,
} from "@joe-kuntani/shared/types/content";
import { Select } from "@joe-kuntani/shared/ui/select";

import { AssetUploadList } from "../media/asset-picker";
import { MarkdownField } from "./markdown-field";
import styles from "./sections-field.module.css";

const TYPES: { value: SectionType; label: string; hint: string }[] = [
  {
    value: "prose",
    label: "Text",
    hint: "A heading and a passage of Markdown.",
  },
  {
    value: "prose_image",
    label: "Text + image",
    hint: "Text set beside one picture. Consecutive blocks alternate sides.",
  },
  {
    value: "quote",
    label: "Quote",
    hint: "A short statement set at display size.",
  },
  { value: "stats", label: "Figures", hint: "A row of label and value pairs." },
  {
    value: "gallery",
    label: "Gallery",
    hint: "Images with an optional caption.",
  },
];

const blankSection = (): ContentSection => ({
  type: "prose",
  heading: "",
  body: "",
  tags: [],
  asset_ids: [],
  items: [],
  flip: false,
});

export function SectionsField({
  value,
  onChange,
  legacyBody = "",
  onConvertLegacyBody,
}: {
  value: ContentSection[];
  onChange: (sections: ContentSection[]) => void;
  legacyBody?: string;
  onConvertLegacyBody?: (sections: ContentSection[]) => void;
}) {
  const sections = value ?? [];
  const [open, setOpen] = useState<number | null>(sections.length ? 0 : null);

  function update(index: number, patch: Partial<ContentSection>) {
    onChange(
      sections.map((section, position) =>
        position === index ? { ...section, ...patch } : section,
      ),
    );
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setOpen(target);
  }

  return (
    <fieldset className={styles.field}>
      <legend className={styles.legend}>
        Page sections
        <span>Typed blocks replace the single body on the published page.</span>
      </legend>

      {sections.length ? (
        <ol className={styles.list}>
          {sections.map((section, index) => {
            const type = TYPES.find((entry) => entry.value === section.type);
            const summary =
              section.heading?.trim() ||
              section.body?.trim().slice(0, 60) ||
              `${type?.label ?? "Block"} (empty)`;
            const expanded = open === index;
            return (
              <li className={styles.item} key={index}>
                <div className={styles.itemHead}>
                  <button
                    className={styles.disclosure}
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : index)}
                  >
                    <span className={styles.badge}>{type?.label}</span>
                    <span className={styles.order} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.summary}>{summary}</span>
                  </button>
                  <div className={styles.tools}>
                    <button
                      type="button"
                      aria-label={`Move ${summary} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${summary} down`}
                      disabled={index === sections.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${summary}`}
                      onClick={() => {
                        onChange(
                          sections.filter((_, position) => position !== index),
                        );
                        setOpen(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className={styles.body}>
                    <div className={styles.typeField}>
                      <span>Type</span>
                      <Select
                        aria-label="Type"
                        options={TYPES}
                        value={section.type}
                        onChange={(value) =>
                          update(index, { type: value as SectionType })
                        }
                        required
                      />
                      <small>{type?.hint}</small>
                    </div>

                    {section.type !== "quote" ? (
                      <label>
                        <span>Heading</span>
                        <input
                          value={section.heading ?? ""}
                          maxLength={160}
                          onChange={(event) =>
                            update(index, { heading: event.target.value })
                          }
                        />
                      </label>
                    ) : null}

                    {section.type !== "stats" ? (
                      <MarkdownField
                        label={
                          section.type === "quote" ? "Quote" : "Description"
                        }
                        // Every Markdown field offers the assistant. These
                        // blocks carry the bulk of a page's prose now, so
                        // leaving them out meant the writing help disappeared
                        // exactly where most of the writing happens.
                        assist={section.type === "quote" ? "summary" : "body"}
                        hint="Markdown is supported. Preview this section before saving the page."
                        rows={section.type === "quote" ? 4 : 10}
                        value={section.body ?? ""}
                        onChange={(body) => update(index, { body })}
                      />
                    ) : null}

                    <label>
                      <span>Section tags</span>
                      <input
                        aria-label="Section tags"
                        value={(section.tags ?? []).join(", ")}
                        placeholder="comedy, guitar, Ghana"
                        onChange={(event) =>
                          update(index, { tags: splitTags(event.target.value) })
                        }
                      />
                      <small>
                        Comma separated. These describe this section only.
                      </small>
                    </label>

                    {section.type === "prose_image" ||
                    section.type === "gallery" ? (
                      <AssetUploadList
                        label={section.type === "gallery" ? "Images" : "Image"}
                        folder="content"
                        max={section.type === "gallery" ? 8 : 1}
                        values={section.asset_ids ?? []}
                        onChange={(asset_ids) => update(index, { asset_ids })}
                      />
                    ) : null}

                    {section.type === "prose_image" ? (
                      <label className={styles.flip}>
                        <input
                          type="checkbox"
                          checked={Boolean(section.flip)}
                          onChange={(event) =>
                            update(index, { flip: event.target.checked })
                          }
                        />
                        Put the image first
                      </label>
                    ) : null}

                    {section.type === "stats" ? (
                      <StatRows
                        items={section.items ?? []}
                        onChange={(items) => update(index, { items })}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.empty}>
            {legacyBody.trim()
              ? "This page still uses one legacy body. Convert it into editable sections."
              : "No sections yet. Add the first section below."}
          </p>
          {legacyBody.trim() && onConvertLegacyBody ? (
            <button
              type="button"
              className={styles.convert}
              onClick={() => {
                setOpen(0);
                onConvertLegacyBody(sectionsFromBody(legacyBody));
              }}
            >
              Convert body to sections
            </button>
          ) : null}
        </div>
      )}

      <button
        type="button"
        className={styles.add}
        onClick={() => {
          onChange([...sections, blankSection()]);
          setOpen(sections.length);
        }}
      >
        Add section
      </button>
    </fieldset>
  );
}

/** Splits the legacy biography without rewriting it. Standalone uppercase or
 * Markdown heading lines become section titles; every other character remains
 * in the corresponding Markdown description. */
export function sectionsFromBody(body: string): ContentSection[] {
  const sections: ContentSection[] = [];
  let heading = "Introduction";
  let lines: string[] = [];

  const flush = () => {
    const description = lines.join("\n").trim();
    if (!description) return;
    sections.push({
      ...blankSection(),
      heading,
      body: description,
      tags: [],
    });
    lines = [];
  };

  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const title = sectionTitle(line);
    if (title) {
      flush();
      heading = title;
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function sectionTitle(line: string) {
  const trimmed = line.trim();
  const markdown = trimmed.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
  if (markdown) return markdown;
  if (trimmed.length < 4 || trimmed.length > 100) return "";
  const letters = trimmed.replace(/[^\p{L}]/gu, "");
  if (!letters || letters !== letters.toUpperCase()) return "";
  return trimmed
    .toLocaleLowerCase("en")
    .replace(/(^|[\s—-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("en"));
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

function StatRows({
  items,
  onChange,
}: {
  items: { label: string; value: string }[];
  onChange: (items: { label: string; value: string }[]) => void;
}) {
  const rows = items.length ? items : [{ label: "", value: "" }];
  return (
    <div className={styles.stats}>
      {rows.map((row, index) => (
        <div className={styles.statRow} key={index}>
          {(["label", "value"] as const).map((field) => (
            <label key={field}>
              <span>
                {field === "label" ? "Label" : "Value"} {index + 1}
              </span>
              <input
                value={row[field]}
                maxLength={120}
                onChange={(event) =>
                  onChange(
                    rows.map((item, position) =>
                      position === index
                        ? { ...item, [field]: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange(rows.filter((_, position) => position !== index))
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.add}
        onClick={() => onChange([...rows, { label: "", value: "" }])}
      >
        Add figure
      </button>
    </div>
  );
}
