"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import styles from "./date-field.module.css";

const subscribeToMount = () => () => {};

type Mode = "date" | "datetime";

type DateFieldProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  mode?: Mode;
  "aria-label"?: string;
  className?: string;
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseValue(value: string, mode: Mode): Date | null {
  if (!value) return null;
  if (mode === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(date: Date, hours: number, minutes: number) {
  return `${formatDate(date)}T${pad(hours)}:${pad(minutes)}`;
}

function formatDisplay(value: string, mode: Mode) {
  const date = parseValue(value, mode);
  if (!date) return mode === "date" ? "Choose date" : "Choose date and time";
  const datePart = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  if (mode === "date") return datePart;
  return `${datePart} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < startOffset; i += 1) {
    const date = new Date(year, month, i - startOffset + 1);
    cells.push({ date, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1]?.date ?? new Date(year, month, 1);
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  return cells;
}

type PanelPlacement = {
  top: number;
  left: number;
  width: number;
};

export function DateField({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  required,
  disabled,
  mode = "date",
  "aria-label": ariaLabel,
  className,
}: DateFieldProps) {
  const generatedId = useId();
  const buttonId = id || `${generatedId}-trigger`;
  const panelId = `${generatedId}-panel`;
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const selected = isControlled ? value : internal;
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToMount,
    () => true,
    () => false,
  );
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedDate = parseValue(selected, mode) ?? new Date();
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const [hours, setHours] = useState(selectedDate.getHours());
  const [minutes, setMinutes] = useState(selectedDate.getMinutes());

  useEffect(() => {
    const parsed = parseValue(selected, mode);
    if (!parsed) return;
    const timer = window.setTimeout(() => {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
      setHours(parsed.getHours());
      setMinutes(parsed.getMinutes());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected, mode]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(328, Math.max(rect.width, 280));
      const gap = 8;
      const estimatedHeight = mode === "datetime" ? 360 : 300;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const preferDown =
        spaceBelow >= estimatedHeight || spaceBelow >= rect.top;
      const top = preferDown
        ? rect.bottom + gap
        : Math.max(8, rect.top - gap - estimatedHeight);
      const left = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - width - 8,
      );
      setPlacement({ top, left, width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
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

  const cells = useMemo(
    () => monthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  function commit(next: string) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }

  function pickDay(date: Date) {
    if (mode === "date") {
      commit(formatDate(date));
      setOpen(false);
      return;
    }
    commit(formatDateTime(date, hours, minutes));
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function onTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
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

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    "en-GB",
    { month: "long", year: "numeric" },
  );

  const panelStyle: CSSProperties | undefined = placement
    ? {
        top: placement.top,
        left: placement.left,
        width: placement.width,
      }
    : undefined;

  const panel =
    open && placement ? (
      <div
        ref={panelRef}
        id={panelId}
        className={styles.panel}
        role="dialog"
        aria-label={ariaLabel || "Choose a date"}
        style={panelStyle}
        /* Marks this as the innermost layer, so a surrounding dialog leaves
           Escape alone while the calendar is open. */
        data-popover-open="true"
      >
        <div className={styles.monthBar}>
          <button
            type="button"
            className={styles.monthNav}
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            ‹
          </button>
          <p className={styles.monthLabel}>{monthLabel}</p>
          <button
            type="button"
            className={styles.monthNav}
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            ›
          </button>
        </div>
        <div className={styles.weekdays} aria-hidden="true">
          {WEEKDAYS.map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
        </div>
        <div className={styles.grid} role="grid">
          {cells.map(({ date, inMonth }) => {
            const key = formatDate(date);
            const isSelected =
              selected &&
              parseValue(selected, mode) &&
              formatDate(parseValue(selected, mode) as Date) === key;
            const isToday = formatDate(new Date()) === key;
            return (
              <button
                key={key + String(inMonth)}
                type="button"
                className={styles.day}
                data-in-month={inMonth ? "true" : "false"}
                data-selected={isSelected ? "true" : "false"}
                data-today={isToday ? "true" : "false"}
                onClick={() => pickDay(date)}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        {mode === "datetime" ? (
          <div className={styles.timeRow}>
            <label>
              Hour
              <input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(event) => {
                  const next = Math.min(
                    23,
                    Math.max(0, Number(event.target.value) || 0),
                  );
                  setHours(next);
                  const base = parseValue(selected, mode) ?? new Date();
                  commit(formatDateTime(base, next, minutes));
                }}
              />
            </label>
            <label>
              Minute
              <input
                type="number"
                min={0}
                max={59}
                step={5}
                value={minutes}
                onChange={(event) => {
                  const next = Math.min(
                    59,
                    Math.max(0, Number(event.target.value) || 0),
                  );
                  setMinutes(next);
                  const base = parseValue(selected, mode) ?? new Date();
                  commit(formatDateTime(base, hours, next));
                }}
              />
            </label>
          </div>
        ) : null}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => {
              commit("");
              setOpen(false);
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className={styles.today}
            onClick={() => {
              const now = new Date();
              if (mode === "date") commit(formatDate(now));
              else
                commit(formatDateTime(now, now.getHours(), now.getMinutes()));
              setOpen(false);
            }}
          >
            Today
          </button>
        </div>
      </div>
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
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((current) => !current);
        }}
        onKeyDown={onTriggerKey}
      >
        <span data-empty={!selected ? "true" : "false"}>
          {formatDisplay(selected, mode)}
        </span>
        <span className={styles.icon} aria-hidden="true" />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
