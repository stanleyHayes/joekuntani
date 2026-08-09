"use client";

import { useState } from "react";
import type { ContentSection, SectionType } from "../../content/types";
import { AssetUploadList } from "../media/asset-picker";
import { MarkdownField } from "./markdown-field";
import styles from "./sections-field.module.css";

/**
 * Builds a page out of typed blocks.
 *
 * A page used to be one Markdown body, so every part of a long page rendered
 * identically. This is where an editor composes the parts instead — add,
 * reorder, retype and delete, with each type showing only the fields it uses.
 */

const TYPES: { value: SectionType; label: string; hint: string }[] = [
  { value: "prose", label: "Text", hint: "A heading and a passage of Markdown." },
  {
    value: "prose_image",
    label: "Text + image",
    hint: "The same, set beside one picture. Consecutive ones alternate sides.",
  },
  { value: "quote", label: "Quote", hint: "One line, set large. No heading needed." },
  { value: "stats", label: "Figures", hint: "A row of label and value pairs." },
  { value: "gallery", label: "Gallery", hint: "A set of images with an optional caption." },
];

const BLANK: ContentSection = {
  type: "prose",
  heading: "",
  body: "",
  asset_ids: [],
  items: [],
  flip: false,
};

export function SectionsField({
  value,
  onChange,
}: {
  value: ContentSection[];
  onChange: (sections: ContentSection[]) => void;
}) {
  // Which block is expanded. A page can run to a dozen blocks, and showing every
  // body at once turns the editor into the wall of text blocks exist to fix.
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);

  const sections = value ?? [];

  function update(index: number, patch: Partial<ContentSection>) {
    onChange(
      sections.map((section, position) =>
        position === index ? { ...section, ...patch } : section,
      ),
    );
  }

  function add() {
    onChange([...sections, { ...BLANK }]);
    setOpen(sections.length);
  }

  function remove(index: number) {
    onChange(sections.filter((_, position) => position !== index));
    setOpen(null);
  }

  /** Moves a block by one place. Order is the page's reading order. */
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
        <span className={styles.legendHint}>
          Built from blocks. Leave empty to keep using the single body above.
        </span>
      </legend>

      {sections.length ? (
        <ol className={styles.list}>
          {sections.map((section, index) => {
            const type = TYPES.find((item) => item.value === section.type);
            const expanded = open === index;
            const summary =
              section.heading?.trim() ||
              section.body?.trim().slice(0, 60) ||
              `${type?.label ?? "Block"} (empty)`;
            return (
              <li className={styles.item} key={index}>
                <div className={styles.itemHead}>
                  <button
                    type="button"
                    className={styles.disclosure}
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : index)}
                  >
                    <span className={styles.badge}>{type?.label ?? section.type}</span>
                    <span className={styles.summary}>{summary}</span>
                  </button>
                  <div className={styles.itemTools}>
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
                      className={styles.remove}
                      aria-label={`Remove ${summary}`}
                      onClick={() => remove(index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className={styles.body}>
                    <label className={styles.typeField}>
                      <span>Type</span>
                      <select
                        value={section.type}
                        onChange={(event) =>
                          update(index, {
                            type: event.target.value as SectionType,
                          })
                        }
                      >
                        {TYPES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <small>{type?.hint}</small>
                    </label>

                    {section.type !== "quote" ? (
                      <label className={styles.headingField}>
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
                        label={section.type === "quote" ? "Quote" : "Body"}
                        value={section.body ?? ""}
                        onChange={(body) => update(index, { body })}
                        rows={section.type === "quote" ? 4 : 12}
                      />
                    ) : null}

                    {section.type === "prose_image" ||
                    section.type === "gallery" ? (
                      <AssetUploadList
                        label={
                          section.type === "gallery" ? "Images" : "Image"
                        }
                        folder="content"
                        max={section.type === "gallery" ? 8 : 1}
                        values={section.asset_ids ?? []}
                        onChange={(asset_ids) => update(index, { asset_ids })}
                      />
                    ) : null}

                    {section.type === "prose_image" ? (
                      <label className={styles.flipField}>
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
        <p className={styles.empty}>
          No sections yet. The page renders its single body until you add one.
        </p>
      )}

      <button type="button" className={styles.add} onClick={add}>
        Add section
      </button>
    </fieldset>
  );
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
          <label>
            <span>Label {index + 1}</span>
            <input
              value={row.label}
              maxLength={120}
              onChange={(event) =>
                onChange(
                  rows.map((item, position) =>
                    position === index
                      ? { ...item, label: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label>
            <span>Value {index + 1}</span>
            <input
              value={row.value}
              maxLength={120}
              onChange={(event) =>
                onChange(
                  rows.map((item, position) =>
                    position === index
                      ? { ...item, value: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            aria-label={`Remove figure ${index + 1}`}
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
