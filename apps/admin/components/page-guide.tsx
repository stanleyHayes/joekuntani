"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";

import { adminGuide } from "../lib/admin-guides";
import styles from "./page-guide.module.css";

const OPEN_KEY = "jk.admin.guide.open";

function speechAvailable() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/** Whether the browser can speak is fixed for the life of the page. */
const subscribeNothing = () => () => {};

/**
 * The disclosure state is stored rather than held in the component, so it
 * survives navigation — the shell keeps this mounted, but an administrator who
 * opens the steps expects them open on the next page too.
 *
 * `localStorage` does not notify the tab that wrote it, so writes go through
 * `setGuideOpen` and fan out here. The `storage` listener covers other tabs.
 */
const openListeners = new Set<() => void>();

function subscribeGuideOpen(listener: () => void) {
  openListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    openListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function guideOpenSnapshot() {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** The server has no storage and no synthesiser; both start off. */
const offOnServer = () => false;

function setGuideOpen(next: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, next ? "1" : "0");
  } catch {
    /* private mode: the preference just does not persist */
  }
  for (const listener of [...openListeners]) listener();
}

/**
 * Per-page help for the admin workspace, with the option to hear it read out.
 *
 * The purpose line is always visible; the steps sit behind a disclosure so the
 * help does not push the actual workspace below the fold. The open state is
 * remembered, so an administrator who wants the steps up permanently gets them
 * on every page.
 *
 * Speech uses the browser's own synthesiser — no dependency, no key, and no
 * per-play cost, which matters for something that exists to be replayed.
 */
export function AdminPageGuide({ title }: { title: string }) {
  const pathname = usePathname() ?? "/admin";
  const guide = adminGuide(pathname);
  const stepsId = useId();
  const headingId = useId();

  const [speaking, setSpeaking] = useState(false);
  const open = useSyncExternalStore(
    subscribeGuideOpen,
    guideOpenSnapshot,
    offOnServer,
  );
  const canSpeak = useSyncExternalStore(
    subscribeNothing,
    speechAvailable,
    offOnServer,
  );

  // Each play gets a number. `cancel()` fires error events on whatever was
  // already queued, and those land after the new run has set itself speaking —
  // without this the stale event switches the button back to "Listen" while
  // the new script is still being read.
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current += 1;
    setSpeaking(false);
    if (speechAvailable()) window.speechSynthesis.cancel();
  }, []);

  // Navigating away must silence the previous page's guide — the synthesiser
  // is global and outlives this component, so it would otherwise keep reading
  // instructions for a page the admin has already left.
  useEffect(() => stop, [pathname, stop]);

  const speak = useCallback(() => {
    if (!guide || !speechAvailable()) return;
    const synthesis = window.speechSynthesis;
    synthesis.cancel();

    const script = [
      `${title}.`,
      guide.purpose,
      "How to use this page.",
      ...guide.steps,
    ].join(" ");

    // Chrome stops a single utterance after roughly fifteen seconds, which
    // would cut this off mid-sentence. Queued sentence by sentence, each one
    // stays well inside that limit and the browser plays them back to back.
    const sentences = script
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    const run = runRef.current + 1;
    runRef.current = run;

    sentences.forEach((sentence, index) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.rate = 0.98;
      utterance.onerror = () => {
        if (runRef.current === run) setSpeaking(false);
      };
      if (index === sentences.length - 1) {
        utterance.onend = () => {
          if (runRef.current === run) setSpeaking(false);
        };
      }
      synthesis.speak(utterance);
    });

    setSpeaking(true);
  }, [guide, title]);

  const toggle = useCallback(() => setGuideOpen(!open), [open]);

  if (!guide) return null;

  return (
    <section className={styles.guide} aria-labelledby={headingId}>
      <div className={styles.head}>
        <div className={styles.intro}>
          <h2 className={styles.heading} id={headingId}>
            What this page is for
          </h2>
          <p className={styles.purpose}>{guide.purpose}</p>
        </div>
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={stepsId}
            onClick={toggle}
          >
            {open ? "Hide the steps" : "How to use this page"}
          </button>
          {canSpeak ? (
            <button
              type="button"
              className={styles.listen}
              aria-pressed={speaking}
              onClick={speaking ? stop : speak}
            >
              {speaking ? "Stop reading" : "Read this aloud"}
            </button>
          ) : null}
        </div>
      </div>
      <ol className={styles.steps} id={stepsId} hidden={!open}>
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
