"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./combobox.module.css";
import { usePopoverPlacement } from "./use-popover-placement";

const subscribeToMount = () => () => {};

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary text, shown dimmed beside the label. */
  hint?: string;
};

type ComboboxProps = {
  options: readonly ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  /** Closed-state text when nothing is chosen. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /**
   * Supplying this enables the create row: when the query matches no option
   * exactly, the list offers to create it. Left out, the control can only
   * choose from what already exists.
   */
  onCreate?: (label: string) => void | Promise<void>;
  createPending?: boolean;
  disabled?: boolean;
  /** "compact" suits a toolbar, where the full-height control would dominate. */
  size?: "default" | "compact";
  /** Renders a hidden input, so uncontrolled form posts carry the value. */
  name?: string;
  id?: string;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
};

type Row =
  | { kind: "option"; value: string; label: string; hint?: string }
  | { kind: "create"; label: string };

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Choose one",
  searchPlaceholder = "Type to filter…",
  emptyMessage = "Nothing matches that.",
  onCreate,
  createPending = false,
  disabled,
  size = "default",
  name,
  id,
  required,
  className,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const generatedId = useId();
  const listId = `${generatedId}-list`;
  const buttonId = id || `${generatedId}-button`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const mounted = useSyncExternalStore(
    subscribeToMount,
    () => true,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const placement = usePopoverPlacement(open, triggerRef, panelRef);

  const selectedOption = options.find((item) => item.value === value);
  const label = selectedOption?.label || placeholder;

  const rows = useMemo<Row[]>(() => {
    const trimmed = query.trim();
    const needle = trimmed.toLowerCase();
    const matches = needle
      ? options.filter((option) => option.label.toLowerCase().includes(needle))
      : [...options];
    const result: Row[] = matches.map((option) => ({
      kind: "option",
      value: option.value,
      label: option.label,
      hint: option.hint,
    }));
    // Only offer to create what does not already exist — otherwise the list
    // invites the operator to make a second "Comedy".
    const exists = options.some(
      (option) => option.label.trim().toLowerCase() === needle,
    );
    if (onCreate && trimmed && !exists) {
      result.push({ kind: "create", label: trimmed });
    }
    return result;
  }, [options, query, onCreate]);

  useEffect(() => {
    setActiveIndex(rows.length ? 0 : -1);
  }, [rows.length, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  // Keep the active row visible: the voice list runs to a hundred entries, so
  // arrowing past the fold has to bring the row with it.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    // Called optionally: scrolling is a nicety, and jsdom does not implement
    // scrollIntoView at all, so insisting on it would fail tests over a
    // convenience the environment cannot provide.
    const row = listRef.current?.children[activeIndex];
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  async function commit(row: Row) {
    if (row.kind === "create") {
      if (createPending) return;
      await onCreate?.(row.label);
      close();
      return;
    }
    onChange?.(row.value);
    close();
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(rows.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(rows.length - 1);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) void commit(row);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key === "Tab") close(false);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpen(true);
    }
  }

  const panelStyle: CSSProperties | undefined = placement
    ? {
        top: placement.top,
        left: placement.left,
        minWidth: placement.minWidth,
        maxWidth: placement.maxWidth,
        maxHeight: placement.maxHeight,
      }
    : undefined;

  const panel =
    open && placement ? (
      <div
        ref={panelRef}
        className={styles.panel}
        style={panelStyle}
        data-pending={createPending ? "true" : "false"}
        /* Marks this as the innermost layer, so a surrounding dialog leaves
           Escape alone while the list is open. */
        data-popover-open="true"
      >
        <input
          ref={searchRef}
          className={styles.search}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel ? `${ariaLabel} filter` : "Filter options"}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-row-${activeIndex}` : undefined
          }
          placeholder={searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
        />
        <ul ref={listRef} id={listId} className={styles.list} role="listbox">
          {rows.map((row, index) =>
            row.kind === "create" ? (
              <li
                key="__create"
                id={`${listId}-row-${index}`}
                role="option"
                aria-selected={false}
                className={styles.create}
                data-active={activeIndex === index ? "true" : "false"}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void commit(row)}
              >
                <span className={styles.createMark} aria-hidden="true">
                  +
                </span>
                {createPending ? "Creating…" : `Create “${row.label}”`}
              </li>
            ) : (
              <li
                key={row.value}
                id={`${listId}-row-${index}`}
                role="option"
                aria-selected={row.value === value}
                className={styles.option}
                data-active={activeIndex === index ? "true" : "false"}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void commit(row)}
              >
                <span className={styles.optionLabel}>{row.label}</span>
                {row.hint ? (
                  <span className={styles.hint}>{row.hint}</span>
                ) : null}
              </li>
            ),
          )}
          {rows.length === 0 ? (
            <li className={styles.empty} role="presentation">
              {emptyMessage}
            </li>
          ) : null}
        </ul>
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-open={open ? "true" : "false"}
      data-size={size}
    >
      {name ? (
        <input
          type="hidden"
          name={name}
          value={value ?? ""}
          required={required && !value}
        />
      ) : null}
      <button
        ref={triggerRef}
        id={buttonId}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span data-empty={!selectedOption ? "true" : "false"}>{label}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
