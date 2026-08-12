"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { Combobox } from "@joe-kuntani/shared/ui/combobox";

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

/**
 * Names that signal a modern neural engine rather than the legacy formant
 * synthesiser most systems still default to.
 */
const NATURAL = /natural|neural|premium|enhanced|siri|online/i;

/**
 * Novelty and first-generation voices. Several ship as the system default,
 * which is why the guide sounded like a robot without anyone choosing one.
 */
const ROBOTIC =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|princess|bruce|agnes|victoria|pipe organ/i;

/** Well-regarded system voices, below the neural ones but far above the rest. */
const DECENT = /samantha|daniel|karen|moira|serena|tessa|google|microsoft/i;

/**
 * Scores an installed voice. Higher is more natural.
 *
 * The browser's own default is whatever the operating system nominated years
 * ago, so the only way to sound human is to look at what is actually
 * installed and choose. English only — the guide is written in English, and a
 * voice reading it with another language's phonetics is worse than robotic.
 */
function voiceScore(voice: SpeechSynthesisVoice) {
  if (!voice.lang?.toLowerCase().startsWith("en")) return -1;
  let score = 0;
  const lang = voice.lang.toLowerCase();
  // Ghana writes and reads British English, so that accent lands closest.
  if (lang.startsWith("en-gb")) score += 3;
  else if (lang.startsWith("en-us")) score += 2;
  else score += 1;
  if (NATURAL.test(voice.name)) score += 6;
  else if (DECENT.test(voice.name)) score += 2;
  if (ROBOTIC.test(voice.name)) score -= 10;
  return score;
}

/**
 * The best installed voice, or null to let the browser decide.
 *
 * Read at speak time rather than on mount: Chrome populates the list
 * asynchronously and reports nothing on first call, so asking early gets an
 * empty array and a robot.
 */
function bestVoice(): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const voice of voices) {
    const score = voiceScore(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

const VOICE_KEY = "jk.admin.guide.voice";

/**
 * The English voices installed, as a stable array.
 *
 * `getVoices()` builds a new array on every call, which a React store cannot
 * subscribe to — returning it directly re-renders forever. The list is cached
 * and only replaced when the names actually change.
 */
let cachedVoices: SpeechSynthesisVoice[] = [];
let cachedKey = "";

function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return cachedVoices;
  const all = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  const key = all.map((voice) => `${voice.name}:${voice.lang}`).join("|");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedVoices = all;
  }
  return cachedVoices;
}

/** Chrome fills the list asynchronously and announces it with this event. */
function subscribeVoices(listener: () => void) {
  if (!speechAvailable()) return () => {};
  const synthesis = window.speechSynthesis;
  synthesis.addEventListener?.("voiceschanged", listener);
  return () => synthesis.removeEventListener?.("voiceschanged", listener);
}

const noVoices: SpeechSynthesisVoice[] = [];
const serverVoices = () => noVoices;

const chosenVoiceListeners = new Set<() => void>();

function subscribeChosenVoice(listener: () => void) {
  chosenVoiceListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    chosenVoiceListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function chosenVoiceSnapshot() {
  try {
    return localStorage.getItem(VOICE_KEY) ?? "";
  } catch {
    return "";
  }
}

const noChoice = () => "";

function setChosenVoice(name: string) {
  try {
    if (name) localStorage.setItem(VOICE_KEY, name);
    else localStorage.removeItem(VOICE_KEY);
  } catch {
    /* private mode: the choice just does not persist */
  }
  for (const listener of [...chosenVoiceListeners]) listener();
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
  const voices = useSyncExternalStore(
    subscribeVoices,
    englishVoices,
    serverVoices,
  );
  const chosenVoice = useSyncExternalStore(
    subscribeChosenVoice,
    chosenVoiceSnapshot,
    noChoice,
  );

  // "Best available" is a real choice rather than an absent one, so it is an
  // option in the list instead of a placeholder: picking it again is how the
  // reader hands the decision back to the machine.
  const voiceOptions = useMemo(
    () => [
      { value: "", label: "Best available" },
      ...voices.map((voice) => ({
        value: voice.name,
        label: voice.name,
        hint: voice.lang,
      })),
    ],
    [voices],
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
    // A chosen voice wins; the scored pick is only the starting point.
    const voice =
      voices.find((candidate) => candidate.name === chosenVoice) ?? bestVoice();

    sentences.forEach((sentence, index) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      if (voice) {
        utterance.voice = voice;
        // Some engines read the wrong phonetics unless the language is set to
        // match the voice, not just the voice itself.
        utterance.lang = voice.lang;
      }
      // Marginally under natural pace: instructions are easier to follow read
      // a little slowly, and the neural voices sound rushed at 1.
      utterance.rate = 0.95;
      utterance.pitch = 1;
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
  }, [guide, title, voices, chosenVoice]);

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
          {/* Only worth showing when there is a choice to make. Systems vary
              enormously in what they install, and the best one here is a guess
              until someone hears it. */}
          {canSpeak && voices.length > 1 ? (
            <div className={styles.voice}>
              <Combobox
                aria-label="Reading voice"
                size="compact"
                options={voiceOptions}
                value={chosenVoice}
                onChange={setChosenVoice}
                placeholder="Best available"
                searchPlaceholder="Search voices…"
                emptyMessage="No installed voice matches that."
              />
            </div>
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
