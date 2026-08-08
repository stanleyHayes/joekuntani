"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./select.module.css";

const subscribeToMount = () => () => {};

export type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

type ListPlacement = {
  top: number;
  left: number;
  /** Floor, not a fixed size — the popover grows to fit its longest option. */
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
};

export function Select({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  options,
  placeholder = "Choose one",
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const generatedId = useId();
  const listId = `${generatedId}-list`;
  const buttonId = id || `${generatedId}-button`;
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const selected = isControlled ? value : internal;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<ListPlacement | null>(null);
  const mounted = useSyncExternalStore(
    subscribeToMount,
    () => true,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((item) => item.value === selected);
  const label = selectedOption?.label || placeholder;

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPlacement(null);
      return;
    }

    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const viewportPad = 8;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
      const spaceAbove = rect.top - viewportPad;
      const preferDown = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(
        120,
        Math.min(288, preferDown ? spaceBelow - gap : spaceAbove - gap),
      );
      const top = preferDown
        ? rect.bottom + gap
        : Math.max(viewportPad, rect.top - gap - maxHeight);
      // The popover was pinned to the trigger's width, so a narrow control (a
      // "Status" filter reading "All") clipped its own options to "payme…".
      // The trigger width becomes a floor instead, and the list is allowed to
      // run to the viewport edge. Measure the natural width first so a list
      // that would overflow gets pulled left rather than cropped.
      const list = listRef.current;
      const natural = list
        ? Math.max(rect.width, list.scrollWidth + 2)
        : rect.width;
      const available = window.innerWidth - viewportPad * 2;
      const width = Math.min(natural, available);
      const left = Math.max(
        viewportPad,
        Math.min(rect.left, window.innerWidth - viewportPad - width),
      );
      setPlacement({
        top,
        left,
        minWidth: rect.width,
        maxWidth: available,
        maxHeight,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open, placement]);

  function commit(next: string) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
    setOpen(false);
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setOpen(true);
      const index = Math.max(
        0,
        options.findIndex((item) => item.value === selected),
      );
      setActiveIndex(index);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) commit(option.value);
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    }
  }

  const listStyle: CSSProperties | undefined = placement
    ? {
        top: placement.top,
        left: placement.left,
        minWidth: placement.minWidth,
        maxWidth: placement.maxWidth,
        maxHeight: placement.maxHeight,
      }
    : undefined;

  const list =
    open && placement ? (
      <ul
        ref={listRef}
        id={listId}
        className={styles.list}
        role="listbox"
        tabIndex={-1}
        aria-labelledby={buttonId}
        style={listStyle}
        onKeyDown={onListKeyDown}
      >
        {placeholder && !required ? (
          <li
            role="option"
            aria-selected={selected === ""}
            className={styles.option}
            data-active={activeIndex === -1 ? "true" : "false"}
            onMouseEnter={() => setActiveIndex(-1)}
            onClick={() => commit("")}
          >
            {placeholder}
          </li>
        ) : null}
        {options.map((option, index) => (
          <li
            key={option.value || `opt-${index}`}
            role="option"
            aria-selected={selected === option.value}
            className={styles.option}
            data-active={activeIndex === index ? "true" : "false"}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => commit(option.value)}
          >
            {option.label}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-open={open ? "true" : "false"}
    >
      {name ? (
        <input
          type="hidden"
          name={name}
          value={selected}
          required={required && !selected}
        />
      ) : null}
      <button
        ref={triggerRef}
        id={buttonId}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((item) => item.value === selected),
            ),
          );
        }}
        onKeyDown={onButtonKeyDown}
      >
        <span data-empty={!selectedOption ? "true" : "false"}>{label}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      {mounted && list ? createPortal(list, document.body) : null}
    </div>
  );
}
