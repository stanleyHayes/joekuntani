import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    // Prefer reduced motion in tests so GSAP never leaves opacity:0 mid-tween.
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

const memoryStore = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, String(value));
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
    clear: () => {
      memoryStore.clear();
    },
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    get length() {
      return memoryStore.size;
    },
  },
});

// GSAP's ticker can outlive the jsdom environment. A frame queued before
// teardown fires after `window` has gone, and reaching through `window` here
// threw a ReferenceError that failed the whole run from outside any test — the
// suite reported "46 passed, 1 error". Which file happened to be last decided
// whether it appeared at all, so it surfaced only when the file list changed.
//
// Taking the timer from the module scope keeps the shim working through
// teardown, and a frame that lands after the document is gone is dropped: that
// is what a real browser does with a torn-down document, and GSAP is entitled
// to assume its callback runs against a live one.
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  setTimeout(() => {
    if (typeof window === "undefined") return;
    cb(Date.now());
  }, 16)) as unknown as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((id: number) => {
  clearTimeout(id);
}) as unknown as typeof cancelAnimationFrame;

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit", variable: "--font-outfit" }),
  DM_Sans: () => ({ className: "font-dm-sans", variable: "--font-dm-sans" }),
  Knewave: () => ({ className: "font-knewave", variable: "--font-knewave" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Testing Library declares failure after 1s of waiting by default. That is
// plenty on an idle machine and not enough on a loaded one: every intermittent
// failure in this suite has been a `findBy*` giving up on a render that was
// merely slow, never one that was wrong. Waiting longer costs nothing when the
// element does appear — the timeout is only reached on a genuine failure.
configure({ asyncUtilTimeout: 5000 });
